import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompleteDistinctActivitiesConfig,
  DraftCourseQuestDto,
  IndependentPracticeConfig,
  QuestObjectiveConfig,
  QuestRewardPolicyDto,
  QuestTemplateId,
} from '@ule/contracts';
import { DraftCourseQuest, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDraftQuestDto } from './dto/create-draft-quest.dto';
import { UpdateDraftQuestDto } from './dto/update-draft-quest.dto';
import { QuestTemplatesRegistry } from './quest-templates.registry';

@Injectable()
export class DraftQuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: QuestTemplatesRegistry,
  ) {}

  /**
   * Creates a new draft course quest within the owned course draft.
   * Locks the parent course row in PostgreSQL to serialize authoring mutations.
   */
  async createDraftQuest(
    courseId: string,
    ownerId: string,
    dto: CreateDraftQuestDto,
  ): Promise<DraftCourseQuestDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCourseForAuthoring(tx, courseId, ownerId);

      const draft = await tx.courseDraft.findUnique({
        where: { courseId },
      });

      if (!draft) {
        throw new NotFoundException(`Draft for course '${courseId}' not found.`);
      }

      // Check template support and validate config
      if (!this.registry.hasTemplate(dto.templateId)) {
        throw new BadRequestException(`Unsupported quest template '${dto.templateId}'.`);
      }

      const validation = this.registry.validateConfig(dto.templateId, dto.config);
      if (!validation.valid) {
        throw new BadRequestException({
          message: `Quest configuration validation failed for template '${dto.templateId}'.`,
          errors: validation.errors,
        });
      }

      // Validate references to draft blocks or skills
      await this.validateQuestBindings(tx, draft.id, courseId, dto.templateId, dto.config);

      // Check unique questKey within draft
      const existing = await tx.draftCourseQuest.findUnique({
        where: {
          draftId_questKey: {
            draftId: draft.id,
            questKey: dto.questKey,
          },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Quest with key '${dto.questKey}' already exists in this course draft.`,
        );
      }

      // Increment draft revision atomically
      await tx.courseDraft.update({
        where: { id: draft.id },
        data: { revision: { increment: 1 } },
      });

      const quest = await tx.draftCourseQuest.create({
        data: {
          draftId: draft.id,
          questKey: dto.questKey,
          title: dto.title,
          description: dto.description ?? null,
          templateId: dto.templateId,
          config: dto.config as unknown as Prisma.InputJsonValue,
          rewardPolicy: (dto.rewardPolicy ?? null) as unknown as Prisma.InputJsonValue,
          revision: 1,
        },
      });

      return this.toDraftQuestDto(quest);
    });
  }

  /**
   * Lists all draft quests for an owned course draft.
   */
  async listDraftQuests(courseId: string, ownerId: string): Promise<DraftCourseQuestDto[]> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course || course.ownerId !== ownerId) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }

    const draft = await this.prisma.courseDraft.findUnique({
      where: { courseId },
    });

    if (!draft) {
      throw new NotFoundException(`Draft for course '${courseId}' not found.`);
    }

    const quests = await this.prisma.draftCourseQuest.findMany({
      where: { draftId: draft.id },
      orderBy: { createdAt: 'asc' },
    });

    return quests.map((q) => this.toDraftQuestDto(q));
  }

  /**
   * Updates a draft course quest under optimistic concurrency control.
   */
  async updateDraftQuest(
    courseId: string,
    questId: string,
    ownerId: string,
    dto: UpdateDraftQuestDto,
  ): Promise<DraftCourseQuestDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCourseForAuthoring(tx, courseId, ownerId);

      const draft = await tx.courseDraft.findUnique({
        where: { courseId },
      });

      if (!draft) {
        throw new NotFoundException(`Draft for course '${courseId}' not found.`);
      }

      const quest = await tx.draftCourseQuest.findUnique({
        where: { id: questId },
      });

      if (!quest || quest.draftId !== draft.id) {
        throw new NotFoundException(`Draft quest '${questId}' not found.`);
      }

      if (quest.revision !== dto.expectedRevision) {
        throw new ConflictException(
          `Conflict: Quest revision mismatch. Expected ${dto.expectedRevision}, but found ${quest.revision}.`,
        );
      }

      const newConfig = dto.config ?? (quest.config as unknown as QuestObjectiveConfig);

      if (dto.config) {
        const validation = this.registry.validateConfig(quest.templateId, dto.config);
        if (!validation.valid) {
          throw new BadRequestException({
            message: `Quest configuration validation failed for template '${quest.templateId}'.`,
            errors: validation.errors,
          });
        }
        await this.validateQuestBindings(tx, draft.id, courseId, quest.templateId, dto.config);
      }

      // Increment draft revision atomically
      await tx.courseDraft.update({
        where: { id: draft.id },
        data: { revision: { increment: 1 } },
      });

      const updated = await tx.draftCourseQuest.update({
        where: { id: quest.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.config !== undefined ? { config: dto.config as unknown as Prisma.InputJsonValue } : {}),
          ...(dto.rewardPolicy !== undefined ? { rewardPolicy: dto.rewardPolicy as unknown as Prisma.InputJsonValue } : {}),
          revision: { increment: 1 },
        },
      });

      return this.toDraftQuestDto(updated);
    });
  }

  /**
   * Deletes a draft course quest.
   */
  async deleteDraftQuest(
    courseId: string,
    questId: string,
    ownerId: string,
    expectedRevision: number,
  ): Promise<{ deleted: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCourseForAuthoring(tx, courseId, ownerId);

      const draft = await tx.courseDraft.findUnique({
        where: { courseId },
      });

      if (!draft) {
        throw new NotFoundException(`Draft for course '${courseId}' not found.`);
      }

      const quest = await tx.draftCourseQuest.findUnique({
        where: { id: questId },
      });

      if (!quest || quest.draftId !== draft.id) {
        throw new NotFoundException(`Draft quest '${questId}' not found.`);
      }

      if (quest.revision !== expectedRevision) {
        throw new ConflictException(
          `Conflict: Quest revision mismatch. Expected ${expectedRevision}, but found ${quest.revision}.`,
        );
      }

      await tx.draftCourseQuest.delete({
        where: { id: quest.id },
      });

      await tx.courseDraft.update({
        where: { id: draft.id },
        data: { revision: { increment: 1 } },
      });

      return { deleted: true };
    });
  }

  private async lockCourseForAuthoring(
    tx: Prisma.TransactionClient,
    courseId: string,
    ownerId: string,
  ): Promise<void> {
    const locked = await tx.$queryRaw<Array<{ id: string; ownerId: string }>>`
      SELECT id, "ownerId" AS "ownerId" FROM courses WHERE id = ${courseId} FOR UPDATE
    `;

    if (!locked || locked.length === 0 || locked[0].ownerId !== ownerId) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }
  }

  private async validateQuestBindings(
    tx: Prisma.TransactionClient,
    draftId: string,
    courseId: string,
    templateId: string,
    config: unknown,
  ): Promise<void> {
    if (templateId === 'COMPLETE_DISTINCT_ACTIVITIES') {
      const c = config as CompleteDistinctActivitiesConfig;
      if (c.requiredBlockInstanceIds && c.requiredBlockInstanceIds.length > 0) {
        const blocks = await tx.draftBlockInstance.findMany({
          where: { draftId },
          select: { id: true },
        });
        const existingBlockIds = new Set(blocks.map((b) => b.id));
        for (const reqId of c.requiredBlockInstanceIds) {
          if (!existingBlockIds.has(reqId)) {
            throw new BadRequestException(
              `Required block instance '${reqId}' not found in course draft.`,
            );
          }
        }
      }
    } else if (templateId === 'INDEPENDENT_PRACTICE') {
      const c = config as IndependentPracticeConfig;
      const skill = await tx.courseSkill.findUnique({
        where: {
          courseId_skillCode: {
            courseId,
            skillCode: c.skillCode,
          },
        },
      });

      if (!skill) {
        throw new BadRequestException(
          `Target skillCode '${c.skillCode}' not found in course skills.`,
        );
      }
    }
  }

  private toDraftQuestDto(quest: DraftCourseQuest): DraftCourseQuestDto {
    return {
      id: quest.id,
      draftId: quest.draftId,
      questKey: quest.questKey,
      title: quest.title,
      description: quest.description,
      templateId: quest.templateId as QuestTemplateId,
      config: quest.config as unknown as QuestObjectiveConfig,
      rewardPolicy: quest.rewardPolicy as unknown as QuestRewardPolicyDto | null,
      revision: quest.revision,
      createdAt: quest.createdAt.toISOString(),
      updatedAt: quest.updatedAt.toISOString(),
    };
  }
}
