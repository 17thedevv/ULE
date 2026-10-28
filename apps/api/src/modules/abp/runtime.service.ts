import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ABAttemptDto,
  ABEventDto,
  ABRunDto,
  AssessmentResultDto,
  BlockInstanceSnapshot,
  RunCloseReason,
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
import { PrismaService } from '../prisma/prisma.service';
import { ExecuteRunCommandDto } from './dto/execute-run-command.dto';
import { StartRunDto } from './dto/start-run.dto';
import { BlockTypeRegistry } from './registry/block-type.registry';

@Injectable()
export class RuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: BlockTypeRegistry,
  ) {}

  /**
   * Starts a new Activity Block Run against a pinned immutable CourseVersion.
   */
  async startRun(userId: string, dto: StartRunDto): Promise<ABRunDto> {
    // 1. Authorize course version access and retrieve pinned snapshot
    const version = await this.prisma.courseVersion.findUnique({
      where: { id: dto.courseVersionId },
      include: { course: true },
    });

    if (!version || version.course.ownerId !== userId) {
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
    const def = this.registry.getDefinition(pinnedBlock.blockTypeId);
    if (!def.manifest.capabilities.runtimeExecutionSupported) {
      throw new BadRequestException(
        `Block type '${pinnedBlock.blockTypeId}' runtime execution is unsupported until an appropriately isolated execution capability is available.`,
      );
    }

    // 3. Idempotency check: if an idempotency key was supplied and an event with it exists
    if (dto.idempotencyKey) {
      const existingEvent = await this.prisma.aBEvent.findFirst({
        where: {
          idempotencyKey: dto.idempotencyKey,
          run: { userId, courseVersionId: version.id, blockInstanceId: pinnedBlock.id },
        },
        include: { run: true },
      });

      if (existingEvent) {
        return this.getRun(existingEvent.run.id, userId);
      }
    }

    // 4. Create Run and record initial RUN_STARTED event atomically
    return this.prisma.$transaction(async (tx) => {
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
        },
      });

      await tx.aBEvent.create({
        data: {
          runId: run.id,
          eventType: 'RUN_STARTED',
          idempotencyKey: dto.idempotencyKey ?? null,
          payload: {
            courseVersionId: version.id,
            blockInstanceId: pinnedBlock.id,
            blockTypeId: pinnedBlock.blockTypeId,
          },
          serverTimestamp: now,
        },
      });

      return this.toRunDto(run, pinnedBlock);
    });
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
      },
    });

    if (!run || run.userId !== userId) {
      throw new NotFoundException(`Run '${runId}' not found.`);
    }

    const pinnedBlock = this.extractPinnedBlock(run.courseVersion, run.blockInstanceId);
    return this.toRunDto(
      run,
      pinnedBlock,
      run.attempts[0],
      run.assessmentResults[0],
    );
  }

  /**
   * Executes a host lifecycle command on a run (START, SUSPEND, RESUME, SUBMIT_RESPONSE, FINISH, ABANDON, FAIL).
   */
  async executeCommand(
    runId: string,
    userId: string,
    dto: ExecuteRunCommandDto,
  ): Promise<ABRunDto> {
    const run = await this.prisma.aBRun.findUnique({
      where: { id: runId },
      include: { courseVersion: true },
    });

    if (!run || run.userId !== userId) {
      throw new NotFoundException(`Run '${runId}' not found.`);
    }

    const pinnedBlock = this.extractPinnedBlock(run.courseVersion, run.blockInstanceId);

    // Idempotency check: if an event with this idempotency key already exists on this run
    if (dto.idempotencyKey) {
      const existingEvent = await this.prisma.aBEvent.findUnique({
        where: {
          runId_idempotencyKey: {
            runId: run.id,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });

      if (existingEvent) {
        // Return existing state without duplicate mutation
        return this.getRun(runId, userId);
      }
    }

    const now = new Date();

    switch (dto.command) {
      case 'START': {
        if (run.status === 'ACTIVE') {
          return this.getRun(runId, userId);
        }
        if (run.status !== 'CREATED') {
          throw new BadRequestException(
            `Cannot start run from '${run.status}' status. Only CREATED runs can be started.`,
          );
        }

        const updated = await this.prisma.$transaction(async (tx) => {
          const r = await tx.aBRun.update({
            where: { id: run.id },
            data: { status: 'ACTIVE', startedAt: now },
          });

          await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'RUN_STARTED',
              idempotencyKey: dto.idempotencyKey ?? null,
              serverTimestamp: now,
            },
          });

          return r;
        });

        return this.toRunDto(updated, pinnedBlock);
      }

      case 'SUSPEND': {
        if (run.status !== 'ACTIVE') {
          throw new BadRequestException(
            `Cannot suspend run in '${run.status}' status. Only ACTIVE runs can be suspended.`,
          );
        }

        const updated = await this.prisma.$transaction(async (tx) => {
          const r = await tx.aBRun.update({
            where: { id: run.id },
            data: { status: 'SUSPENDED' },
          });

          await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'RUN_SUSPENDED',
              idempotencyKey: dto.idempotencyKey ?? null,
              serverTimestamp: now,
            },
          });

          return r;
        });

        return this.toRunDto(updated, pinnedBlock);
      }

      case 'RESUME': {
        if (run.status !== 'SUSPENDED') {
          throw new BadRequestException(
            `Cannot resume run in '${run.status}' status. Only SUSPENDED runs can be resumed.`,
          );
        }

        const updated = await this.prisma.$transaction(async (tx) => {
          const r = await tx.aBRun.update({
            where: { id: run.id },
            data: { status: 'ACTIVE' },
          });

          await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'RUN_RESUMED',
              idempotencyKey: dto.idempotencyKey ?? null,
              serverTimestamp: now,
            },
          });

          return r;
        });

        return this.toRunDto(updated, pinnedBlock);
      }

      case 'SUBMIT_RESPONSE': {
        if (run.status !== 'ACTIVE') {
          throw new BadRequestException(
            `Cannot submit response when run is in '${run.status}' status. Run must be ACTIVE.`,
          );
        }

        const def = this.registry.getDefinition(pinnedBlock.blockTypeId);
        if (!def.manifest.capabilities.submittable || !def.manifest.capabilities.evaluatable) {
          throw new BadRequestException(
            `Block type '${pinnedBlock.blockTypeId}' does not accept response submissions or server evaluation.`,
          );
        }

        // Support / Assistance context preservation
        const assisted = Boolean(dto.payload?.usedHint || dto.payload?.assisted);
        const supportContext = {
          hintUsed: assisted,
          assistanceLevel: assisted ? 'HINT' : 'NONE',
        };

        const submittedResponse =
          (dto.payload?.response as Record<string, unknown>) ??
          dto.payload ??
          {};

        // Deterministic server-side evaluation against protected block configuration
        const evaluatedOutcome = await this.registry.evaluate(
          pinnedBlock.blockTypeId,
          pinnedBlock.config,
          {
            runId: run.id,
            attemptId: 'temp',
            attemptNumber: 0,
            userId,
            submittedResponse,
            supportContext,
          },
        );

        return this.prisma.$transaction(async (tx) => {
          const attemptCount = await tx.aBAttempt.count({
            where: { runId: run.id },
          });
          const attemptNumber = attemptCount + 1;

          const attempt = await tx.aBAttempt.create({
            data: {
              runId: run.id,
              attemptNumber,
              submittedResponse: submittedResponse as unknown as Prisma.InputJsonValue,
              assisted,
              supportContext: supportContext as unknown as Prisma.InputJsonValue,
              idempotencyKey: dto.idempotencyKey ?? null,
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
              idempotencyKey: dto.idempotencyKey ?? null,
              payload: {
                attemptNumber,
                assisted,
                isCorrect: evaluatedOutcome.isCorrect,
              },
              serverTimestamp: now,
            },
          });

          return this.toRunDto(run, pinnedBlock, attempt, assessment);
        });
      }

      case 'FINISH': {
        if (run.status !== 'ACTIVE') {
          throw new BadRequestException(
            `Cannot finish run in '${run.status}' status. Run must be ACTIVE.`,
          );
        }

        const updated = await this.prisma.$transaction(async (tx) => {
          const r = await tx.aBRun.update({
            where: { id: run.id },
            data: {
              status: 'CLOSED',
              closeReason: 'COMPLETED',
              closedAt: now,
            },
          });

          await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'RUN_COMPLETED',
              idempotencyKey: dto.idempotencyKey ?? null,
              payload: {
                ungraded: pinnedBlock.blockTypeId === 'video',
              },
              serverTimestamp: now,
            },
          });

          return r;
        });

        return this.toRunDto(updated, pinnedBlock);
      }

      case 'ABANDON': {
        if (run.status === 'CLOSED') {
          throw new BadRequestException('Cannot abandon a run that is already CLOSED.');
        }

        const updated = await this.prisma.$transaction(async (tx) => {
          const r = await tx.aBRun.update({
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
              idempotencyKey: dto.idempotencyKey ?? null,
              serverTimestamp: now,
            },
          });

          return r;
        });

        return this.toRunDto(updated, pinnedBlock);
      }

      case 'FAIL': {
        if (run.status === 'CLOSED') {
          throw new BadRequestException('Cannot fail a run that is already CLOSED.');
        }

        const failureReason =
          typeof dto.payload?.reason === 'string'
            ? dto.payload.reason
            : 'Runtime execution failure';

        const updated = await this.prisma.$transaction(async (tx) => {
          const r = await tx.aBRun.update({
            where: { id: run.id },
            data: {
              status: 'CLOSED',
              closeReason: 'FAILED',
              failureDetails: failureReason,
              closedAt: now,
            },
          });

          await tx.aBEvent.create({
            data: {
              runId: run.id,
              eventType: 'RUN_FAILED',
              idempotencyKey: dto.idempotencyKey ?? null,
              payload: { reason: failureReason },
              serverTimestamp: now,
            },
          });

          return r;
        });

        return this.toRunDto(updated, pinnedBlock);
      }

      default:
        throw new BadRequestException(`Unknown command '${(dto as { command: string }).command}'.`);
    }
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
    const latestAttempt = run.attempts[run.attempts.length - 1];
    const latestAssessment = run.assessmentResults[run.assessmentResults.length - 1];

    return {
      run: this.toRunDto(run, pinnedBlock, latestAttempt, latestAssessment),
      attempts: run.attempts.map((a) => this.toAttemptDto(a)),
      assessments: run.assessmentResults.map((ar) => this.toAssessmentDto(ar)),
      events: run.events.map((e) => this.toEventDto(e)),
    };
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
  ): ABRunDto {
    const learnerConfig = this.registry.sanitizeForLearner(
      pinnedBlock.blockTypeId,
      pinnedBlock.config,
    );

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
      latestAssessment: assessment ? this.toAssessmentDto(assessment) : null,
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

  private toAssessmentDto(entity: AssessmentResult): AssessmentResultDto {
    return {
      id: entity.id,
      attemptId: entity.attemptId,
      runId: entity.runId,
      status: entity.status,
      isCorrect: entity.isCorrect,
      score: entity.score,
      feedback: entity.feedback as Record<string, unknown> | string | null,
      evaluatorId: entity.evaluatorId,
      evaluatedAt: entity.evaluatedAt.toISOString(),
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private toEventDto(entity: ABEvent): ABEventDto {
    return {
      id: entity.id,
      runId: entity.runId,
      eventType: entity.eventType,
      payload: entity.payload as Record<string, unknown> | null,
      idempotencyKey: entity.idempotencyKey,
      serverTimestamp: entity.serverTimestamp.toISOString(),
    };
  }
}
