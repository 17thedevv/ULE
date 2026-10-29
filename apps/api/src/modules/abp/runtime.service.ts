import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ABAttemptDto,
  ABEventDto,
  ABRunDto,
  AssessmentResultDto,
  BlockInstanceSnapshot,
  RunCloseReason,
  RunCommandType,
  RunResultsDto,
  RunStatus,
} from '@ule/contracts';
import {
  ABAttempt,
  ABEvent,
  ABRun,
  AssessmentResult,
  CourseVersion,
  Prisma,
} from '@prisma/client';
import { EvidenceIntakeService } from '../evidence/evidence-intake.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExecuteRunCommandDto } from './dto/execute-run-command.dto';
import { StartRunDto } from './dto/start-run.dto';
import { BlockTypeRegistry } from './registry/block-type.registry';

@Injectable()
export class RuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: BlockTypeRegistry,
    @Optional() private readonly evidenceIntake?: EvidenceIntakeService,
  ) {}

  /**
   * Starts a new Activity Block Run against a pinned immutable CourseVersion.
   * Concurrently safe and idempotent: replaying with the same idempotencyKey returns
   * the existing run without duplicate rows, while mismatched parameters return 409 Conflict.
   */
  async startRun(userId: string, dto: StartRunDto): Promise<ABRunDto> {
    // 1. Authorize course version access and retrieve pinned snapshot
    const version = await this.prisma.courseVersion.findUnique({
      where: { id: dto.courseVersionId },
      include: { course: true },
    });

    if (!version) {
      throw new NotFoundException(
        `CourseVersion '${dto.courseVersionId}' not found.`,
      );
    }

    const isOwner = version.course.ownerId === userId;
    let hasActiveGrant = false;
    if (!isOwner) {
      const grant = await this.prisma.courseAccessGrant.findUnique({
        where: {
          courseVersionId_userId: {
            courseVersionId: version.id,
            userId,
          },
        },
      });
      hasActiveGrant = grant?.status === 'ACTIVE';
    }

    if (!isOwner && !hasActiveGrant) {
      throw new NotFoundException(
        `CourseVersion '${dto.courseVersionId}' not found.`,
      );
    }

    const snapshot = version.snapshot as {
      blocks?: BlockInstanceSnapshot[];
    };
    const blocks = snapshot.blocks ?? [];
    const pinnedBlock = blocks.find((b) => b.id === dto.blockInstanceId);

    if (!pinnedBlock) {
      throw new NotFoundException(
        `Block instance '${dto.blockInstanceId}' not found in course version '${dto.courseVersionId}'.`,
      );
    }

    // 2. Extensibility guard: Coding block execution is strictly unsupported in Phase 1B
    const def = this.registry.getDefinition(pinnedBlock.blockTypeId, pinnedBlock.typeVersion);
    if (!def.manifest.capabilities.runtimeExecutionSupported) {
      throw new BadRequestException(
        `Block type '${pinnedBlock.blockTypeId}' runtime execution is unsupported until an appropriately isolated execution capability is available.`,
      );
    }

    // 3. Sequential idempotency check
    const existingRun = await this.prisma.aBRun.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { courseVersion: true },
    });

    if (existingRun) {
      if (
        existingRun.userId === userId &&
        existingRun.courseVersionId === version.id &&
        existingRun.blockInstanceId === pinnedBlock.id
      ) {
        return this.getRun(existingRun.id, userId);
      }
      throw new ConflictException(
        `Idempotency key '${dto.idempotencyKey}' was already used for a different run request.`,
      );
    }

    // 4. Create Run atomically, handling concurrent insertion races via unique constraint catch
    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const run = await tx.aBRun.create({
          data: {
            userId,
            courseVersionId: version.id,
            blockInstanceId: pinnedBlock.id,
            blockTypeId: pinnedBlock.blockTypeId,
            typeVersion: pinnedBlock.typeVersion,
            status: 'ACTIVE',
            startedAt: now,
            idempotencyKey: dto.idempotencyKey,
          },
        });

        await tx.aBEvent.create({
          data: {
            runId: run.id,
            eventType: 'RUN_STARTED',
            idempotencyKey: dto.idempotencyKey,
            payload: {
              courseVersionId: version.id,
              blockInstanceId: pinnedBlock.id,
              blockTypeId: pinnedBlock.blockTypeId,
              _requestPayload: this.normalizePayload(dto as unknown as Record<string, unknown>),
            } as unknown as Prisma.InputJsonValue,
            serverTimestamp: now,
          },
        });

        return this.toRunDto(run, pinnedBlock);
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const racedRun = await this.prisma.aBRun.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: { courseVersion: true },
        });

        if (
          racedRun &&
          racedRun.userId === userId &&
          racedRun.courseVersionId === version.id &&
          racedRun.blockInstanceId === pinnedBlock.id
        ) {
          return this.getRun(racedRun.id, userId);
        }

        throw new ConflictException(
          `Idempotency key '${dto.idempotencyKey}' was already used for a different run request.`,
        );
      }
      throw err;
    }
  }

  /**
   * Retrieves permitted runtime state for an owned run.
   */
  async getRun(runId: string, userId: string): Promise<ABRunDto> {
    const run = await this.prisma.aBRun.findUnique({
      where: { id: runId },
      include: {
        courseVersion: true,
        attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 },
        assessmentResults: { orderBy: { createdAt: 'desc' }, take: 1 },
        events: { where: { eventType: 'HINT_DELIVERED' }, take: 1 },
      },
    });

    if (!run || run.userId !== userId) {
      throw new NotFoundException(`Run '${runId}' not found.`);
    }

    const pinnedBlock = this.extractPinnedBlock(run.courseVersion, run.blockInstanceId);
    const hintEvent = run.events[0] ?? null;
    const deliveredHint = hintEvent
      ? (hintEvent.payload as { hintText?: string })?.hintText ??
        (pinnedBlock.config as { hintText?: string })?.hintText ??
        null
      : null;

    return this.toRunDto(
      run,
      pinnedBlock,
      run.attempts[0],
      run.assessmentResults[0],
      deliveredHint,
    );
  }

  /**
   * Executes a host lifecycle command on a run under an exclusive row-level lock.
   * State transitions, monotonic attempt ordering, and idempotency deduplication are atomic.
   */
  async executeCommand(
    runId: string,
    userId: string,
    dto: ExecuteRunCommandDto,
  ): Promise<ABRunDto> {
    // 1. FAIL is reserved for trusted runtime authority; reject from client command surface
    if ((dto.command as string) === 'FAIL') {
      throw new BadRequestException(
        "The 'FAIL' command is reserved for trusted runtime authority and cannot be issued by clients.",
      );
    }

    // 2. Execute under exclusive row lock on the ab_runs record
    return this.prisma.$transaction(async (tx) => {
      const lockedRuns = await tx.$queryRaw<{ id: string; userId: string; status: RunStatus }[]>`
        SELECT id, "userId" AS "userId", status FROM ab_runs WHERE id = ${runId} FOR UPDATE
      `;

      if (!lockedRuns || lockedRuns.length === 0 || lockedRuns[0].userId !== userId) {
        throw new NotFoundException(`Run '${runId}' not found.`);
      }

      const run = await tx.aBRun.findUniqueOrThrow({
        where: { id: runId },
        include: { courseVersion: { include: { course: true } } },
      });

      // Authorization guard: verify active access grant for non-owner learners
      const isOwner = run.courseVersion.course.ownerId === userId;
      if (!isOwner) {
        const grant = await tx.courseAccessGrant.findUnique({
          where: {
            courseVersionId_userId: {
              courseVersionId: run.courseVersionId,
              userId,
            },
          },
        });
        if (!grant || grant.status !== 'ACTIVE') {
          throw new ForbiddenException(
            'Course access grant has been revoked or is not active.',
          );
        }
      }

      const pinnedBlock = this.extractPinnedBlock(run.courseVersion, run.blockInstanceId);
      const def = this.registry.getDefinition(pinnedBlock.blockTypeId, pinnedBlock.typeVersion);

      // Check if hint was previously delivered on this run
      const existingHintEvent = await tx.aBEvent.findFirst({
        where: { runId: run.id, eventType: 'HINT_DELIVERED' },
      });
      let deliveredHint = existingHintEvent
        ? (existingHintEvent.payload as { hintText?: string })?.hintText ??
          (pinnedBlock.config as { hintText?: string })?.hintText ??
          null
        : null;

      // 3. Concurrent Idempotency Check under the row-level lock
      const existingEvent = await tx.aBEvent.findUnique({
        where: {
          runId_idempotencyKey: {
            runId: run.id,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });

      if (existingEvent) {
        const expectedEventType = this.mapCommandToEventType(dto.command);
        if (existingEvent.eventType !== expectedEventType) {
          throw new ConflictException(
            `Idempotency key '${dto.idempotencyKey}' was already used for a different command on this run.`,
          );
        }

        // Compare normalized request payloads
        const eventPayload = (existingEvent.payload as Record<string, unknown>) || {};
        const incomingNormStr = JSON.stringify(this.normalizePayload(dto.payload));
        const storedNormStr = JSON.stringify(this.normalizePayload(eventPayload._requestPayload));

        if (incomingNormStr !== storedNormStr) {
          throw new ConflictException(
            `Idempotency key '${dto.idempotencyKey}' was already used with different payload data on this run.`,
          );
        }

        // Fetch original attempt if command was SUBMIT_RESPONSE
        let replayAttempt: ABAttempt | null = null;
        let replayAssessment: AssessmentResult | null = null;

        if (dto.command === 'SUBMIT_RESPONSE') {
          replayAttempt = await tx.aBAttempt.findFirst({
            where: {
              runId: run.id,
              idempotencyKey: dto.idempotencyKey,
            },
          });

          if (replayAttempt) {
            replayAssessment = await tx.assessmentResult.findFirst({
              where: {
                runId: run.id,
                attemptId: replayAttempt.id,
              },
            });
          }
        } else {
          replayAttempt = await tx.aBAttempt.findFirst({
            where: { runId: run.id },
            orderBy: { attemptNumber: 'desc' },
          });
          replayAssessment = await tx.assessmentResult.findFirst({
            where: { runId: run.id },
            orderBy: { createdAt: 'desc' },
          });
        }

        return this.toRunDto(run, pinnedBlock, replayAttempt, replayAssessment, deliveredHint);
      }

      const now = new Date();

      switch (dto.command) {
        case 'START': {
          if (run.status === 'ACTIVE') {
            return this.toRunDto(run, pinnedBlock, null, null, deliveredHint);
          }
          if (run.status !== 'CREATED') {
            throw new BadRequestException(
              `Cannot start run from '${run.status}' status. Only CREATED runs can be started.`,
            );
          }

          const updated = await tx.aBRun.update({
            where: { id: run.id },
            data: { status: 'ACTIVE', startedAt: now },
          });

          await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'RUN_STARTED',
              idempotencyKey: dto.idempotencyKey,
              payload: {
                _requestPayload: this.normalizePayload(dto.payload),
              } as unknown as Prisma.InputJsonValue,
              serverTimestamp: now,
            },
          });

          return this.toRunDto(updated, pinnedBlock, null, null, deliveredHint);
        }

        case 'SUSPEND': {
          if (run.status !== 'ACTIVE') {
            throw new BadRequestException(
              `Cannot suspend run in '${run.status}' status. Only ACTIVE runs can be suspended.`,
            );
          }

          const updated = await tx.aBRun.update({
            where: { id: run.id },
            data: { status: 'SUSPENDED' },
          });

          await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'RUN_SUSPENDED',
              idempotencyKey: dto.idempotencyKey,
              payload: {
                _requestPayload: this.normalizePayload(dto.payload),
              } as unknown as Prisma.InputJsonValue,
              serverTimestamp: now,
            },
          });

          const latestAttempt = await tx.aBAttempt.findFirst({
            where: { runId: run.id },
            orderBy: { attemptNumber: 'desc' },
          });
          const latestAssessment = await tx.assessmentResult.findFirst({
            where: { runId: run.id },
            orderBy: { createdAt: 'desc' },
          });

          return this.toRunDto(updated, pinnedBlock, latestAttempt, latestAssessment, deliveredHint);
        }

        case 'RESUME': {
          if (run.status === 'ACTIVE') {
            return this.toRunDto(run, pinnedBlock, null, null, deliveredHint);
          }
          if (run.status !== 'SUSPENDED') {
            throw new BadRequestException(
              `Cannot resume run in '${run.status}' status. Only SUSPENDED runs can be resumed.`,
            );
          }

          const updated = await tx.aBRun.update({
            where: { id: run.id },
            data: { status: 'ACTIVE' },
          });

          await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'RUN_RESUMED',
              idempotencyKey: dto.idempotencyKey,
              payload: {
                _requestPayload: this.normalizePayload(dto.payload),
              } as unknown as Prisma.InputJsonValue,
              serverTimestamp: now,
            },
          });

          const latestAttempt = await tx.aBAttempt.findFirst({
            where: { runId: run.id },
            orderBy: { attemptNumber: 'desc' },
          });
          const latestAssessment = await tx.assessmentResult.findFirst({
            where: { runId: run.id },
            orderBy: { createdAt: 'desc' },
          });

          return this.toRunDto(updated, pinnedBlock, latestAttempt, latestAssessment, deliveredHint);
        }

        case 'REQUEST_HINT': {
          if (run.status !== 'ACTIVE') {
            throw new BadRequestException(
              `Cannot request hint in '${run.status}' status. Run must be ACTIVE.`,
            );
          }

          const blockConfig = pinnedBlock.config as {
            allowHints?: boolean;
            hintText?: string;
          };

          if (!blockConfig.allowHints || !blockConfig.hintText) {
            throw new BadRequestException(
              'Hints are not enabled for this activity block.',
            );
          }

          await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'HINT_DELIVERED',
              idempotencyKey: dto.idempotencyKey,
              payload: {
                hintText: blockConfig.hintText,
                _requestPayload: this.normalizePayload(dto.payload),
              } as unknown as Prisma.InputJsonValue,
              serverTimestamp: now,
            },
          });

          deliveredHint = blockConfig.hintText;

          const latestAttempt = await tx.aBAttempt.findFirst({
            where: { runId: run.id },
            orderBy: { attemptNumber: 'desc' },
          });
          const latestAssessment = await tx.assessmentResult.findFirst({
            where: { runId: run.id },
            orderBy: { createdAt: 'desc' },
          });

          return this.toRunDto(run, pinnedBlock, latestAttempt, latestAssessment, deliveredHint);
        }

        case 'SUBMIT_RESPONSE': {
          if (run.status !== 'ACTIVE') {
            throw new BadRequestException(
              `Cannot submit response when run is in '${run.status}' status. Run must be ACTIVE.`,
            );
          }

          if (
            !def.manifest.capabilities.submittable ||
            !def.manifest.capabilities.evaluatable
          ) {
            throw new BadRequestException(
              `Block type '${pinnedBlock.blockTypeId}' does not accept response submissions or server evaluation.`,
            );
          }

          // Gate 4: Trusted Assistance Provenance Model
          // Check if server recorded a HINT_DELIVERED event on this run
          const hintDeliveredEvent = await tx.aBEvent.findFirst({
            where: { runId: run.id, eventType: 'HINT_DELIVERED' },
          });

          let assisted: boolean;
          let supportContext: Record<string, unknown>;

          if (hintDeliveredEvent) {
            // Server-observed assistance: client cannot claim independence when hint was delivered
            assisted = true;
            supportContext = {
              hintUsed: true,
              assistanceLevel: 'SERVER_OBSERVED_HINT',
              provenance: 'SERVER_OBSERVED',
              hintDelivered: true,
            };
          } else if (
            dto.payload?.usedHint === true ||
            dto.payload?.assisted === true
          ) {
            // Client self-reported assistance
            assisted = true;
            supportContext = {
              hintUsed: true,
              assistanceLevel: 'CLIENT_REPORTED',
              provenance: 'SELF_REPORTED_ASSISTED',
            };
          } else {
            // Client self-reported independence (unverified, not verified by proctor)
            assisted = false;
            supportContext = {
              hintUsed: false,
              assistanceLevel: 'NONE',
              provenance: 'SELF_REPORTED_INDEPENDENT',
            };
          }

          const submittedResponse =
            (dto.payload?.response as Record<string, unknown>) ??
            dto.payload ??
            {};

          // Atomically calculate next attemptNumber under the row-level lock
          const lastAttempt = await tx.aBAttempt.findFirst({
            where: { runId: run.id },
            orderBy: { attemptNumber: 'desc' },
          });
          const attemptNumber = (lastAttempt?.attemptNumber ?? 0) + 1;

          // Deterministic server-side evaluation against protected block configuration
          const evaluatedOutcome = await def.evaluateResponse!(
            pinnedBlock.config,
            {
              runId: run.id,
              attemptId: 'temp',
              attemptNumber,
              userId,
              submittedResponse,
              supportContext,
            },
          );

          const attempt = await tx.aBAttempt.create({
            data: {
              runId: run.id,
              attemptNumber,
              submittedResponse: submittedResponse as unknown as Prisma.InputJsonValue,
              assisted,
              supportContext: supportContext as unknown as Prisma.InputJsonValue,
              idempotencyKey: dto.idempotencyKey,
              createdAt: now,
            },
          });

          const assessment = await tx.assessmentResult.create({
            data: {
              attemptId: attempt.id,
              runId: run.id,
              status: evaluatedOutcome.status,
              isCorrect: evaluatedOutcome.isCorrect,
              score: evaluatedOutcome.score,
              feedback: evaluatedOutcome.feedback as unknown as Prisma.InputJsonValue,
              evaluatorId: evaluatedOutcome.evaluatorId,
              evaluatedAt: now,
              createdAt: now,
            },
          });

          await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'ATTEMPT_SUBMITTED',
              idempotencyKey: dto.idempotencyKey,
              payload: {
                attemptNumber,
                assisted,
                isCorrect: evaluatedOutcome.isCorrect,
                provenance: String(supportContext.provenance),
                _requestPayload: this.normalizePayload(dto.payload),
              } as unknown as Prisma.InputJsonValue,
              serverTimestamp: now,
            },
          });

          // Ingest verified ABP attempt into Trusted Evidence Ledger
          if (this.evidenceIntake) {
            await this.evidenceIntake.ingestAttempt(
              {
                run,
                attempt,
                assessmentResult: assessment,
                courseVersion: run.courseVersion,
              },
              tx,
            );
          }

          return this.toRunDto(run, pinnedBlock, attempt, assessment, deliveredHint);
        }

        case 'FINISH': {
          if (run.status !== 'ACTIVE') {
            throw new BadRequestException(
              `Cannot finish run in '${run.status}' status. Run must be ACTIVE.`,
            );
          }

          const updated = await tx.aBRun.update({
            where: { id: run.id },
            data: {
              status: 'CLOSED',
              closeReason: 'COMPLETED',
              closedAt: now,
            },
          });

          const completedEvent = await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'RUN_COMPLETED',
              idempotencyKey: dto.idempotencyKey,
              payload: {
                ungraded: pinnedBlock.blockTypeId === 'video',
                _requestPayload: this.normalizePayload(dto.payload),
              } as unknown as Prisma.InputJsonValue,
              serverTimestamp: now,
            },
          });

          // Ingest run completion progress evidence (e.g. video completion)
          if (this.evidenceIntake && pinnedBlock.blockTypeId === 'video') {
            await this.evidenceIntake.ingestRunCompletion(
              {
                run: updated,
                event: completedEvent,
                courseVersion: run.courseVersion,
              },
              tx,
            );
          }

          const latestAttempt = await tx.aBAttempt.findFirst({
            where: { runId: run.id },
            orderBy: { attemptNumber: 'desc' },
          });
          const latestAssessment = await tx.assessmentResult.findFirst({
            where: { runId: run.id },
            orderBy: { createdAt: 'desc' },
          });

          return this.toRunDto(updated, pinnedBlock, latestAttempt, latestAssessment, deliveredHint);
        }

        case 'ABANDON': {
          if (run.status === 'CLOSED') {
            throw new BadRequestException(
              'Cannot abandon a run that is already CLOSED.',
            );
          }

          const updated = await tx.aBRun.update({
            where: { id: run.id },
            data: {
              status: 'CLOSED',
              closeReason: 'ABANDONED',
              closedAt: now,
            },
          });

          await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'RUN_ABANDONED',
              idempotencyKey: dto.idempotencyKey,
              payload: {
                _requestPayload: this.normalizePayload(dto.payload),
              } as unknown as Prisma.InputJsonValue,
              serverTimestamp: now,
            },
          });

          const latestAttempt = await tx.aBAttempt.findFirst({
            where: { runId: run.id },
            orderBy: { attemptNumber: 'desc' },
          });
          const latestAssessment = await tx.assessmentResult.findFirst({
            where: { runId: run.id },
            orderBy: { createdAt: 'desc' },
          });

          return this.toRunDto(updated, pinnedBlock, latestAttempt, latestAssessment, deliveredHint);
        }

        default:
          throw new BadRequestException(
            `Unknown command '${(dto as { command: string }).command}'.`,
          );
      }
    });
  }

  /**
   * Retrieves all attempts, assessments, and events for a run.
   */
  async getRunResults(runId: string, userId: string): Promise<RunResultsDto> {
    const run = await this.prisma.aBRun.findUnique({
      where: { id: runId },
      include: {
        courseVersion: true,
        attempts: { orderBy: { attemptNumber: 'asc' } },
        assessmentResults: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { serverTimestamp: 'asc' } },
      },
    });

    if (!run || run.userId !== userId) {
      throw new NotFoundException(`Run '${runId}' not found.`);
    }

    const pinnedBlock = this.extractPinnedBlock(run.courseVersion, run.blockInstanceId);
    const latestAttempt = run.attempts[run.attempts.length - 1] ?? null;
    const latestAssessment = run.assessmentResults[run.assessmentResults.length - 1] ?? null;

    const hintEvent = run.events.find((e) => e.eventType === 'HINT_DELIVERED');
    const deliveredHint = hintEvent
      ? (hintEvent.payload as { hintText?: string })?.hintText ??
        (pinnedBlock.config as { hintText?: string })?.hintText ??
        null
      : null;

    const isDeferred =
      (pinnedBlock.config as { feedbackPolicy?: string })?.feedbackPolicy ===
      'DEFERRED';
    const isCompleted =
      run.status === 'CLOSED' && run.closeReason === 'COMPLETED';
    const shouldRedactDeferred = isDeferred && !isCompleted;

    return {
      run: this.toRunDto(run, pinnedBlock, latestAttempt, latestAssessment, deliveredHint),
      attempts: run.attempts.map((a) => this.toAttemptDto(a)),
      assessments: run.assessmentResults.map((ar) =>
        this.toAssessmentDto(ar, shouldRedactDeferred),
      ),
      events: run.events.map((e) => this.toEventDto(e, shouldRedactDeferred)),
    };
  }

  private mapCommandToEventType(command: RunCommandType): string {
    switch (command) {
      case 'START':
        return 'RUN_STARTED';
      case 'SUSPEND':
        return 'RUN_SUSPENDED';
      case 'RESUME':
        return 'RUN_RESUMED';
      case 'REQUEST_HINT':
        return 'HINT_DELIVERED';
      case 'SUBMIT_RESPONSE':
        return 'ATTEMPT_SUBMITTED';
      case 'FINISH':
        return 'RUN_COMPLETED';
      case 'ABANDON':
        return 'RUN_ABANDONED';
      default:
        return 'UNKNOWN';
    }
  }

  private extractPinnedBlock(
    version: CourseVersion,
    blockInstanceId: string,
  ): BlockInstanceSnapshot {
    const snapshot = version.snapshot as {
      blocks?: BlockInstanceSnapshot[];
    };
    const blocks = snapshot.blocks ?? [];
    const block = blocks.find((b) => b.id === blockInstanceId);

    if (!block) {
      throw new NotFoundException(
        `Pinned block '${blockInstanceId}' not found in course version '${version.id}'.`,
      );
    }

    return block;
  }

  private toRunDto(
    run: ABRun,
    pinnedBlock: BlockInstanceSnapshot,
    attempt?: ABAttempt | null,
    assessment?: AssessmentResult | null,
    deliveredHint?: string | null,
  ): ABRunDto {
    const learnerConfig = this.registry.sanitizeForLearner(
      pinnedBlock.blockTypeId,
      pinnedBlock.config,
      pinnedBlock.typeVersion,
    );

    const isDeferred =
      (pinnedBlock.config as { feedbackPolicy?: string })?.feedbackPolicy ===
      'DEFERRED';
    const isCompleted =
      run.status === 'CLOSED' && run.closeReason === 'COMPLETED';
    const shouldRedactDeferred = isDeferred && !isCompleted;

    return {
      id: run.id,
      userId: run.userId,
      courseVersionId: run.courseVersionId,
      blockInstanceId: run.blockInstanceId,
      blockTypeId: run.blockTypeId,
      typeVersion: run.typeVersion,
      status: run.status as RunStatus,
      closeReason: run.closeReason as RunCloseReason | null,
      failureDetails: run.failureDetails,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      closedAt: run.closedAt ? run.closedAt.toISOString() : null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      block: {
        id: pinnedBlock.id,
        blockTypeId: pinnedBlock.blockTypeId,
        typeVersion: pinnedBlock.typeVersion,
        title: pinnedBlock.title,
        orderIndex: pinnedBlock.orderIndex,
        learnerConfig,
      },
      latestAttempt: attempt ? this.toAttemptDto(attempt) : null,
      latestAssessment: assessment
        ? this.toAssessmentDto(assessment, shouldRedactDeferred)
        : null,
      deliveredHint: deliveredHint ?? null,
    };
  }

  private toAttemptDto(entity: ABAttempt): ABAttemptDto {
    return {
      id: entity.id,
      runId: entity.runId,
      attemptNumber: entity.attemptNumber,
      submittedResponse: entity.submittedResponse as Record<string, unknown>,
      assisted: entity.assisted,
      supportContext: entity.supportContext as Record<string, unknown> | null,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private toAssessmentDto(
    entity: AssessmentResult,
    shouldRedactDeferred = false,
  ): AssessmentResultDto {
    if (shouldRedactDeferred) {
      return {
        id: entity.id,
        attemptId: entity.attemptId,
        runId: entity.runId,
        status: entity.status,
        isCorrect: null,
        score: null,
        feedback: {
          deferred: true,
          message:
            'Feedback for this assessment is deferred until the run is completed.',
        },
        evaluatorId: entity.evaluatorId,
        evaluatedAt: entity.evaluatedAt.toISOString(),
        createdAt: entity.createdAt.toISOString(),
      };
    }

    const rawFeedback = entity.feedback as Record<string, unknown> | null;
    let releasedFeedback: Record<string, unknown> | string | null = rawFeedback;

    if (rawFeedback && rawFeedback.deferred === true) {
      releasedFeedback = {
        deferred: false,
        released: true,
        isCorrect: entity.isCorrect,
        explanation: rawFeedback.explanation ?? null,
        selectedOptionText: rawFeedback.selectedOptionText ?? null,
        optionExplanation: rawFeedback.optionExplanation ?? null,
      };
    }

    return {
      id: entity.id,
      attemptId: entity.attemptId,
      runId: entity.runId,
      status: entity.status,
      isCorrect: entity.isCorrect,
      score: entity.score,
      feedback: releasedFeedback,
      evaluatorId: entity.evaluatorId,
      evaluatedAt: entity.evaluatedAt.toISOString(),
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private toEventDto(
    entity: ABEvent,
    shouldRedactDeferred = false,
  ): ABEventDto {
    let payload = entity.payload as Record<string, unknown> | null;
    if (shouldRedactDeferred && payload && entity.eventType === 'ATTEMPT_SUBMITTED') {
      payload = {
        ...payload,
        isCorrect: null,
      };
    }

    return {
      id: entity.id,
      runId: entity.runId,
      eventType: entity.eventType,
      payload,
      idempotencyKey: entity.idempotencyKey,
      serverTimestamp: entity.serverTimestamp.toISOString(),
    };
  }

  private normalizePayload(payload: unknown): Record<string, unknown> | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    const record = payload as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const val = record[key];
      if (val !== undefined) {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          sorted[key] = this.normalizePayload(val);
        } else {
          sorted[key] = val;
        }
      }
    }
    return sorted;
  }
}
