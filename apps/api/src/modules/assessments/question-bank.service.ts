/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateQuestionBankItemDto,
  EssayRubric,
  QuestionBankItemDto,
  QuestionVersionDto,
  UpdateQuestionBankItemDto,
} from '@ule/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionBankQueryDto } from './dto/question-bank.dto';
import { QuestionTypesRegistry } from './questions/question-types.registry';

@Injectable()
export class QuestionBankService {
  private readonly logger = new Logger(QuestionBankService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionTypesRegistry: QuestionTypesRegistry,
  ) {}

  /**
   * Creates a new reusable QuestionBankItem owned by the authenticated creator.
   */
  async createItem(
    userId: string,
    dto: CreateQuestionBankItemDto,
  ): Promise<QuestionBankItemDto> {
    // 1. If courseId is provided, verify user owns the course
    if (dto.courseId) {
      await this.verifyCourseOwnership(dto.courseId, userId);
    }

    // 2. Validate question content, answerKey and rubric against allowlisted type definition
    const validation = this.questionTypesRegistry.validateQuestion(
      dto.type,
      dto.content,
      dto.answerKey,
      dto.rubric,
    );
    if (!validation.valid) {
      throw new BadRequestException(
        `Invalid question configuration for type '${dto.type}': ${validation.errors.join(' ')}`,
      );
    }

    // 3. Persist QuestionBankItem
    const item = await this.prisma.questionBankItem.create({
      data: {
        ownerId: userId,
        courseId: dto.courseId ?? null,
        type: dto.type,
        title: dto.title.trim(),
        prompt: dto.prompt.trim(),
        content: dto.content as unknown as Prisma.InputJsonValue,
        answerKey: dto.answerKey
          ? (dto.answerKey as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        rubric: dto.rubric
          ? (dto.rubric as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        config: dto.config
          ? (dto.config as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        defaultPoints: dto.defaultPoints ?? 1.0,
        skillCode: dto.skillCode?.trim() || null,
        difficulty: dto.difficulty?.trim() || null,
        tags: dto.tags ?? [],
        revision: 1,
        publishedVersionCount: 0,
      },
    });

    this.logger.log(`Created QuestionBankItem '${item.id}' (${item.type}) for user '${userId}'.`);
    return this.mapItemToDto(item);
  }

  /**
   * Updates an existing QuestionBankItem with optimistic revision check.
   */
  async updateItem(
    id: string,
    userId: string,
    dto: UpdateQuestionBankItemDto,
  ): Promise<QuestionBankItemDto> {
    const existing = await this.prisma.questionBankItem.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`QuestionBankItem '${id}' not found.`);
    }

    if (existing.ownerId !== userId) {
      throw new ForbiddenException(`You do not have access to QuestionBankItem '${id}'.`);
    }

    // Optimistic concurrency check
    if (existing.revision !== dto.expectedRevision) {
      throw new ConflictException(
        `Stale revision: expected revision ${dto.expectedRevision} does not match current revision ${existing.revision}.`,
      );
    }

    if (dto.courseId && dto.courseId !== existing.courseId) {
      await this.verifyCourseOwnership(dto.courseId, userId);
    }

    const mergedContent = (dto.content ?? existing.content) as Record<string, unknown>;
    const mergedAnswerKey = (dto.answerKey !== undefined
      ? dto.answerKey
      : existing.answerKey) as Record<string, unknown> | null;
    const mergedRubric = (dto.rubric !== undefined
      ? dto.rubric
      : existing.rubric) as EssayRubric | null;

    const validation = this.questionTypesRegistry.validateQuestion(
      existing.type,
      mergedContent,
      mergedAnswerKey,
      mergedRubric,
    );
    if (!validation.valid) {
      throw new BadRequestException(
        `Invalid updated question configuration for type '${existing.type}': ${validation.errors.join(' ')}`,
      );
    }

    const updateData: Prisma.QuestionBankItemUncheckedUpdateManyInput = {
      revision: { increment: 1 },
      updatedAt: new Date(),
    };

    if (dto.title !== undefined) updateData.title = dto.title.trim();
    if (dto.prompt !== undefined) updateData.prompt = dto.prompt.trim();
    if (dto.content !== undefined) {
      updateData.content = dto.content as unknown as Prisma.InputJsonValue;
    }
    if (dto.answerKey !== undefined) {
      updateData.answerKey = dto.answerKey
        ? (dto.answerKey as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }
    if (dto.rubric !== undefined) {
      updateData.rubric = dto.rubric
        ? (dto.rubric as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }
    if (dto.config !== undefined) {
      updateData.config = dto.config
        ? (dto.config as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }
    if (dto.defaultPoints !== undefined) updateData.defaultPoints = dto.defaultPoints;
    if (dto.skillCode !== undefined) updateData.skillCode = dto.skillCode?.trim() || null;
    if (dto.difficulty !== undefined) updateData.difficulty = dto.difficulty?.trim() || null;
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    if (dto.courseId !== undefined) updateData.courseId = dto.courseId;

    // Atomic CAS update
    const result = await this.prisma.questionBankItem.updateMany({
      where: {
        id,
        ownerId: userId,
        revision: dto.expectedRevision,
      },
      data: updateData,
    });

    if (result.count === 0) {
      const current = await this.prisma.questionBankItem.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException(`QuestionBankItem '${id}' not found.`);
      }
      if (current.ownerId !== userId) {
        throw new ForbiddenException(`You do not have access to QuestionBankItem '${id}'.`);
      }
      throw new ConflictException(
        `Stale revision: expected revision ${dto.expectedRevision} does not match current revision ${current.revision}.`,
      );
    }

    const updated = await this.prisma.questionBankItem.findUniqueOrThrow({
      where: { id },
    });

    this.logger.log(`Updated QuestionBankItem '${id}' to revision ${updated.revision}.`);
    return this.mapItemToDto(updated);
  }

  /**
   * Publishes an immutable QuestionVersion snapshot from the current QuestionBankItem draft.
   */
  async publishVersion(id: string, userId: string): Promise<QuestionVersionDto> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock item FOR UPDATE
      const lockedItems = await tx.$queryRaw<{ id: string; ownerId: string }[]>`
        SELECT id, "ownerId" AS "ownerId" FROM question_bank_items
        WHERE id = ${id} FOR UPDATE
      `;

      if (!lockedItems || lockedItems.length === 0) {
        throw new NotFoundException(`QuestionBankItem '${id}' not found.`);
      }

      if (lockedItems[0].ownerId !== userId) {
        throw new ForbiddenException(`You do not have access to QuestionBankItem '${id}'.`);
      }

      const item = await tx.questionBankItem.findUniqueOrThrow({
        where: { id },
      });

      // 2. Validate publishability before snapshotting (auto-evaluators require answerKey, essays require rubric)
      const publishValidation = this.questionTypesRegistry.validatePublishability(
        item.type,
        item.content as Record<string, unknown>,
        item.answerKey as Record<string, unknown> | null,
        item.rubric as EssayRubric | null,
      );
      if (!publishValidation.valid) {
        throw new BadRequestException(
          `Cannot publish QuestionVersion: question is not publishable: ${publishValidation.errors.join(' ')}`,
        );
      }

      // 3. Resolve next versionNumber
      const latestVersion = await tx.questionVersion.findFirst({
        where: { questionBankItemId: id },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

      // 4. Create immutable QuestionVersion
      const version = await tx.questionVersion.create({
        data: {
          questionBankItemId: id,
          versionNumber: nextVersionNumber,
          type: item.type,
          title: item.title,
          prompt: item.prompt,
          content: item.content as Prisma.InputJsonValue,
          answerKey: item.answerKey ? (item.answerKey as Prisma.InputJsonValue) : Prisma.JsonNull,
          rubric: item.rubric ? (item.rubric as Prisma.InputJsonValue) : Prisma.JsonNull,
          config: item.config ? (item.config as Prisma.InputJsonValue) : Prisma.JsonNull,
          defaultPoints: item.defaultPoints,
          skillCode: item.skillCode,
          sourceRevision: item.revision,
          createdById: userId,
        },
      });

      // 5. Increment publishedVersionCount
      await tx.questionBankItem.update({
        where: { id },
        data: {
          publishedVersionCount: { increment: 1 },
        },
      });

      this.logger.log(
        `Published QuestionVersion '${version.id}' (v${nextVersionNumber}) for item '${id}'.`,
      );
      return this.mapVersionToDto(version);
    });
  }

  /**
   * Retrieves creator-owned QuestionBankItems matching search and filter parameters.
   */
  async listItems(userId: string, query?: QuestionBankQueryDto): Promise<QuestionBankItemDto[]> {
    const where: Prisma.QuestionBankItemWhereInput = {
      ownerId: userId,
    };

    if (query?.type) {
      where.type = query.type;
    }
    if (query?.courseId) {
      where.courseId = query.courseId;
    }
    if (query?.skillCode) {
      where.skillCode = query.skillCode;
    }
    if (query?.tag) {
      where.tags = { has: query.tag };
    }
    if (query?.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { prompt: { contains: term, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.questionBankItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return items.map((i) => this.mapItemToDto(i));
  }

  /**
   * Retrieves single QuestionBankItem with creator authorization.
   */
  async getItem(id: string, userId: string): Promise<QuestionBankItemDto> {
    const item = await this.prisma.questionBankItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`QuestionBankItem '${id}' not found.`);
    }

    if (item.ownerId !== userId) {
      throw new ForbiddenException(`You do not have access to QuestionBankItem '${id}'.`);
    }

    return this.mapItemToDto(item);
  }

  /**
   * Lists published versions for a QuestionBankItem.
   */
  async listVersions(questionBankItemId: string, userId: string): Promise<QuestionVersionDto[]> {
    await this.getItem(questionBankItemId, userId);

    const versions = await this.prisma.questionVersion.findMany({
      where: { questionBankItemId },
      orderBy: { versionNumber: 'asc' },
    });

    return versions.map((v) => this.mapVersionToDto(v));
  }

  /**
   * Retrieves a specific published QuestionVersion by version number.
   */
  async getVersion(
    questionBankItemId: string,
    versionNumber: number,
    userId: string,
  ): Promise<QuestionVersionDto> {
    await this.getItem(questionBankItemId, userId);

    const version = await this.prisma.questionVersion.findUnique({
      where: {
        questionBankItemId_versionNumber: {
          questionBankItemId,
          versionNumber,
        },
      },
    });

    if (!version) {
      throw new NotFoundException(
        `QuestionVersion v${versionNumber} not found for item '${questionBankItemId}'.`,
      );
    }

    return this.mapVersionToDto(version);
  }

  /**
   * Deletes a QuestionBankItem if none of its published versions are pinned in an AssessmentVersion.
   */
  async deleteItem(id: string, userId: string): Promise<{ deleted: boolean; id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.questionBankItem.findUnique({
        where: { id },
      });

      if (!item) {
        throw new NotFoundException(`QuestionBankItem '${id}' not found.`);
      }

      if (item.ownerId !== userId) {
        throw new ForbiddenException(`You do not have access to QuestionBankItem '${id}'.`);
      }

      // Invariant: Cannot delete item if any version is pinned in a published assessment version!
      const pinnedCount = await tx.assessmentVersionItem.count({
        where: {
          questionVersion: {
            questionBankItemId: id,
          },
        },
      });

      if (pinnedCount > 0) {
        throw new BadRequestException(
          `Cannot delete QuestionBankItem '${id}': one or more of its versions are pinned in published AssessmentVersions.`,
        );
      }

      await tx.questionBankItem.delete({
        where: { id },
      });

      this.logger.log(`Deleted QuestionBankItem '${id}'.`);
      return { deleted: true, id };
    });
  }

  private async verifyCourseOwnership(courseId: string, userId: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { ownerId: true },
    });

    if (!course) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }

    if (course.ownerId !== userId) {
      throw new ForbiddenException(`You do not own Course '${courseId}'.`);
    }
  }

  private mapItemToDto(item: any): QuestionBankItemDto {
    return {
      id: item.id,
      ownerId: item.ownerId,
      courseId: item.courseId,
      type: item.type,
      title: item.title,
      prompt: item.prompt,
      content: item.content as Record<string, unknown>,
      answerKey: (item.answerKey as Record<string, unknown>) ?? null,
      rubric: (item.rubric as EssayRubric) ?? null,
      config: (item.config as Record<string, unknown>) ?? null,
      defaultPoints: item.defaultPoints,
      skillCode: item.skillCode,
      difficulty: item.difficulty,
      tags: item.tags,
      revision: item.revision,
      publishedVersionCount: item.publishedVersionCount,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private mapVersionToDto(v: any): QuestionVersionDto {
    return {
      id: v.id,
      questionBankItemId: v.questionBankItemId,
      versionNumber: v.versionNumber,
      type: v.type,
      title: v.title,
      prompt: v.prompt,
      content: v.content as Record<string, unknown>,
      answerKey: (v.answerKey as Record<string, unknown>) ?? null,
      rubric: (v.rubric as EssayRubric) ?? null,
      config: (v.config as Record<string, unknown>) ?? null,
      defaultPoints: v.defaultPoints,
      skillCode: v.skillCode,
      sourceRevision: v.sourceRevision,
      createdById: v.createdById,
      createdAt: v.createdAt.toISOString(),
    };
  }
}
