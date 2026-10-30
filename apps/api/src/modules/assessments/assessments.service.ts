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
  AddAssessmentItemDto,
  AssessmentDefinitionDto,
  AssessmentItemRefDto,
  AssessmentSectionDto,
  AssessmentVersionDto,
  CreateAssessmentDefinitionDto,
  CreateAssessmentSectionDto,
  SanitizedLearnerAssessmentPreviewDto,
  SanitizedLearnerQuestionPreviewDto,
  UpdateAssessmentDefinitionDto,
  UpdateAssessmentItemDto,
  UpdateAssessmentSectionDto,
} from '@ule/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionTypesRegistry } from './questions/question-types.registry';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionTypesRegistry: QuestionTypesRegistry,
  ) {}

  /**
   * Creates a new draft AssessmentDefinition owned by the creator.
   */
  async createAssessment(
    userId: string,
    dto: CreateAssessmentDefinitionDto,
  ): Promise<AssessmentDefinitionDto> {
    if (dto.courseId) {
      await this.verifyCourseOwnership(dto.courseId, userId);
    }

    const definition = await this.prisma.assessmentDefinition.create({
      data: {
        ownerId: userId,
        courseId: dto.courseId ?? null,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        instructions: dto.instructions?.trim() || null,
        durationMinutes: dto.durationMinutes ?? null,
        passingScore: dto.passingScore ?? null,
        maxAttempts: dto.maxAttempts ?? null,
        feedbackPolicy: dto.feedbackPolicy ?? 'ON_SUBMISSION',
        status: 'DRAFT',
        revision: 1,
        publishedVersionCount: 0,
      },
      include: {
        sections: {
          include: {
            items: true,
          },
        },
      },
    });

    this.logger.log(`Created AssessmentDefinition '${definition.id}' for user '${userId}'.`);
    return this.mapDefinitionToDto(definition);
  }

  /**
   * Updates an AssessmentDefinition with optimistic concurrency check.
   */
  async updateAssessment(
    id: string,
    userId: string,
    dto: UpdateAssessmentDefinitionDto,
  ): Promise<AssessmentDefinitionDto> {
    const existing = await this.prisma.assessmentDefinition.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`AssessmentDefinition '${id}' not found.`);
    }

    if (existing.ownerId !== userId) {
      throw new ForbiddenException(`You do not have access to AssessmentDefinition '${id}'.`);
    }

    if (existing.revision !== dto.expectedRevision) {
      throw new ConflictException(
        `Stale revision: expected revision ${dto.expectedRevision} does not match current revision ${existing.revision}.`,
      );
    }

    if (dto.courseId && dto.courseId !== existing.courseId) {
      await this.verifyCourseOwnership(dto.courseId, userId);
    }

    const updated = await this.prisma.assessmentDefinition.update({
      where: { id },
      data: {
        title: dto.title !== undefined ? dto.title.trim() : existing.title,
        description: dto.description !== undefined ? (dto.description?.trim() || null) : existing.description,
        instructions: dto.instructions !== undefined ? (dto.instructions?.trim() || null) : existing.instructions,
        durationMinutes: dto.durationMinutes !== undefined ? dto.durationMinutes : existing.durationMinutes,
        passingScore: dto.passingScore !== undefined ? dto.passingScore : existing.passingScore,
        maxAttempts: dto.maxAttempts !== undefined ? dto.maxAttempts : existing.maxAttempts,
        feedbackPolicy: dto.feedbackPolicy ?? existing.feedbackPolicy,
        courseId: dto.courseId !== undefined ? dto.courseId : existing.courseId,
        revision: existing.revision + 1,
      },
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            items: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
      },
    });

    this.logger.log(`Updated AssessmentDefinition '${id}' to revision ${updated.revision}.`);
    return this.mapDefinitionToDto(updated);
  }

  /**
   * Adds a section to the assessment definition.
   */
  async addSection(
    assessmentId: string,
    userId: string,
    dto: CreateAssessmentSectionDto,
  ): Promise<AssessmentSectionDto> {
    await this.verifyAssessmentOwnership(assessmentId, userId);

    const section = await this.prisma.assessmentSection.create({
      data: {
        assessmentDefinitionId: assessmentId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        orderIndex: dto.orderIndex ?? 0,
      },
      include: {
        items: true,
      },
    });

    return this.mapSectionToDto(section);
  }

  /**
   * Updates an existing section in the assessment.
   */
  async updateSection(
    assessmentId: string,
    sectionId: string,
    userId: string,
    dto: UpdateAssessmentSectionDto,
  ): Promise<AssessmentSectionDto> {
    await this.verifyAssessmentOwnership(assessmentId, userId);

    const section = await this.prisma.assessmentSection.findFirst({
      where: { id: sectionId, assessmentDefinitionId: assessmentId },
    });

    if (!section) {
      throw new NotFoundException(
        `Section '${sectionId}' not found in assessment '${assessmentId}'.`,
      );
    }

    const updated = await this.prisma.assessmentSection.update({
      where: { id: sectionId },
      data: {
        title: dto.title !== undefined ? dto.title.trim() : section.title,
        description: dto.description !== undefined ? (dto.description?.trim() || null) : section.description,
        orderIndex: dto.orderIndex ?? section.orderIndex,
      },
      include: {
        items: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    return this.mapSectionToDto(updated);
  }

  /**
   * Deletes a section and its item references.
   */
  async deleteSection(
    assessmentId: string,
    sectionId: string,
    userId: string,
  ): Promise<{ deleted: boolean; sectionId: string }> {
    await this.verifyAssessmentOwnership(assessmentId, userId);

    const section = await this.prisma.assessmentSection.findFirst({
      where: { id: sectionId, assessmentDefinitionId: assessmentId },
    });

    if (!section) {
      throw new NotFoundException(
        `Section '${sectionId}' not found in assessment '${assessmentId}'.`,
      );
    }

    await this.prisma.assessmentSection.delete({
      where: { id: sectionId },
    });

    return { deleted: true, sectionId };
  }

  /**
   * Adds a QuestionBankItem reference to a section.
   */
  async addItem(
    assessmentId: string,
    sectionId: string,
    userId: string,
    dto: AddAssessmentItemDto,
  ): Promise<AssessmentItemRefDto> {
    await this.verifyAssessmentOwnership(assessmentId, userId);

    const section = await this.prisma.assessmentSection.findFirst({
      where: { id: sectionId, assessmentDefinitionId: assessmentId },
    });

    if (!section) {
      throw new NotFoundException(
        `Section '${sectionId}' not found in assessment '${assessmentId}'.`,
      );
    }

    // Verify creator owns the QuestionBankItem
    const questionItem = await this.prisma.questionBankItem.findUnique({
      where: { id: dto.questionBankItemId },
    });

    if (!questionItem) {
      throw new NotFoundException(`QuestionBankItem '${dto.questionBankItemId}' not found.`);
    }

    if (questionItem.ownerId !== userId) {
      throw new ForbiddenException(`You do not own QuestionBankItem '${dto.questionBankItemId}'.`);
    }

    // If pinnedQuestionVersionId is specified, verify it exists and belongs to this question item
    if (dto.pinnedQuestionVersionId) {
      const qv = await this.prisma.questionVersion.findUnique({
        where: { id: dto.pinnedQuestionVersionId },
      });
      if (!qv || qv.questionBankItemId !== dto.questionBankItemId) {
        throw new BadRequestException(
          `QuestionVersion '${dto.pinnedQuestionVersionId}' does not belong to QuestionBankItem '${dto.questionBankItemId}'.`,
        );
      }
    }

    const itemRef = await this.prisma.assessmentItemRef.create({
      data: {
        sectionId,
        questionBankItemId: dto.questionBankItemId,
        pinnedQuestionVersionId: dto.pinnedQuestionVersionId ?? null,
        orderIndex: dto.orderIndex ?? 0,
        points: dto.points ?? questionItem.defaultPoints,
        isRequired: dto.isRequired ?? true,
      },
      include: {
        questionBankItem: {
          select: {
            id: true,
            title: true,
            type: true,
            prompt: true,
            defaultPoints: true,
            skillCode: true,
          },
        },
      },
    });

    return this.mapItemRefToDto(itemRef);
  }

  /**
   * Updates an item reference within a section.
   */
  async updateItem(
    assessmentId: string,
    sectionId: string,
    itemId: string,
    userId: string,
    dto: UpdateAssessmentItemDto,
  ): Promise<AssessmentItemRefDto> {
    await this.verifyAssessmentOwnership(assessmentId, userId);

    const itemRef = await this.prisma.assessmentItemRef.findFirst({
      where: { id: itemId, sectionId },
    });

    if (!itemRef) {
      throw new NotFoundException(`AssessmentItemRef '${itemId}' not found in section '${sectionId}'.`);
    }

    if (dto.pinnedQuestionVersionId) {
      const qv = await this.prisma.questionVersion.findUnique({
        where: { id: dto.pinnedQuestionVersionId },
      });
      if (!qv || qv.questionBankItemId !== itemRef.questionBankItemId) {
        throw new BadRequestException(
          `QuestionVersion '${dto.pinnedQuestionVersionId}' does not belong to question item '${itemRef.questionBankItemId}'.`,
        );
      }
    }

    const updated = await this.prisma.assessmentItemRef.update({
      where: { id: itemId },
      data: {
        pinnedQuestionVersionId: dto.pinnedQuestionVersionId !== undefined
          ? dto.pinnedQuestionVersionId
          : itemRef.pinnedQuestionVersionId,
        points: dto.points ?? itemRef.points,
        orderIndex: dto.orderIndex ?? itemRef.orderIndex,
        isRequired: dto.isRequired ?? itemRef.isRequired,
      },
      include: {
        questionBankItem: {
          select: {
            id: true,
            title: true,
            type: true,
            prompt: true,
            defaultPoints: true,
            skillCode: true,
          },
        },
      },
    });

    return this.mapItemRefToDto(updated);
  }

  /**
   * Removes an item reference from a section.
   */
  async removeItem(
    assessmentId: string,
    sectionId: string,
    itemId: string,
    userId: string,
  ): Promise<{ deleted: boolean; itemId: string }> {
    await this.verifyAssessmentOwnership(assessmentId, userId);

    const itemRef = await this.prisma.assessmentItemRef.findFirst({
      where: { id: itemId, sectionId },
    });

    if (!itemRef) {
      throw new NotFoundException(`AssessmentItemRef '${itemId}' not found in section '${sectionId}'.`);
    }

    await this.prisma.assessmentItemRef.delete({
      where: { id: itemId },
    });

    return { deleted: true, itemId };
  }

  /**
   * Retrieves an AssessmentDefinition with full sections and item references.
   */
  async getAssessment(id: string, userId: string): Promise<AssessmentDefinitionDto> {
    const definition = await this.prisma.assessmentDefinition.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            items: {
              orderBy: { orderIndex: 'asc' },
              include: {
                questionBankItem: {
                  select: {
                    id: true,
                    title: true,
                    type: true,
                    prompt: true,
                    defaultPoints: true,
                    skillCode: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!definition) {
      throw new NotFoundException(`AssessmentDefinition '${id}' not found.`);
    }

    if (definition.ownerId !== userId) {
      throw new ForbiddenException(`You do not have access to AssessmentDefinition '${id}'.`);
    }

    return this.mapDefinitionToDto(definition);
  }

  /**
   * Lists all AssessmentDefinitions owned by the creator.
   */
  async listAssessments(userId: string, courseId?: string): Promise<AssessmentDefinitionDto[]> {
    const where: Prisma.AssessmentDefinitionWhereInput = {
      ownerId: userId,
    };
    if (courseId) {
      where.courseId = courseId;
    }

    const assessments = await this.prisma.assessmentDefinition.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            items: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
      },
    });

    return assessments.map((a) => this.mapDefinitionToDto(a));
  }

  /**
   * Validates the assessment blueprint and publishes an immutable AssessmentVersion snapshot.
   */
  async publishAssessment(
    id: string,
    userId: string,
    idempotencyKey?: string,
  ): Promise<AssessmentVersionDto> {
    void idempotencyKey;
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the assessment definition row FOR UPDATE
      const lockedDefs = await tx.$queryRaw<{ id: string; ownerId: string }[]>`
        SELECT id, "ownerId" AS "ownerId" FROM assessment_definitions
        WHERE id = ${id} FOR UPDATE
      `;

      if (!lockedDefs || lockedDefs.length === 0) {
        throw new NotFoundException(`AssessmentDefinition '${id}' not found.`);
      }

      if (lockedDefs[0].ownerId !== userId) {
        throw new ForbiddenException(`You do not have access to AssessmentDefinition '${id}'.`);
      }

      const definition = await tx.assessmentDefinition.findUniqueOrThrow({
        where: { id },
        include: {
          sections: {
            orderBy: { orderIndex: 'asc' },
            include: {
              items: {
                orderBy: { orderIndex: 'asc' },
              },
            },
          },
        },
      });

      // 2. Structural blueprint validations
      if (definition.sections.length === 0) {
        throw new BadRequestException(
          `Cannot publish assessment '${id}': blueprint must contain at least one section.`,
        );
      }

      const totalItemsCount = definition.sections.reduce(
        (sum, s) => sum + s.items.length,
        0,
      );
      if (totalItemsCount === 0) {
        throw new BadRequestException(
          `Cannot publish assessment '${id}': blueprint must contain at least one question item.`,
        );
      }

      // 3. Resolve and validate pinned QuestionVersions for every item
      let totalPoints = 0;
      const snapshotSections: any[] = [];
      const versionItemsToCreate: Array<{
        questionVersionId: string;
        orderIndex: number;
        points: number;
      }> = [];

      let globalItemOrder = 0;

      for (const section of definition.sections) {
        const sectionItemsSnapshot: any[] = [];

        for (const itemRef of section.items) {
          if (itemRef.points <= 0) {
            throw new BadRequestException(
              `Item '${itemRef.id}' in section '${section.title}' has invalid points: points must be greater than 0.`,
            );
          }

          // Resolve QuestionVersion: explicitly pinned or latest published version
          let resolvedVersion: any = null;

          if (itemRef.pinnedQuestionVersionId) {
            resolvedVersion = await tx.questionVersion.findUnique({
              where: { id: itemRef.pinnedQuestionVersionId },
            });
            if (!resolvedVersion || resolvedVersion.questionBankItemId !== itemRef.questionBankItemId) {
              throw new BadRequestException(
                `Pinned QuestionVersion '${itemRef.pinnedQuestionVersionId}' is invalid for item '${itemRef.id}'.`,
              );
            }
          } else {
            resolvedVersion = await tx.questionVersion.findFirst({
              where: { questionBankItemId: itemRef.questionBankItemId },
              orderBy: { versionNumber: 'desc' },
            });
            if (!resolvedVersion) {
              throw new BadRequestException(
                `Cannot publish assessment: QuestionBankItem '${itemRef.questionBankItemId}' referenced in section '${section.title}' has no published QuestionVersion. Publish the question version first.`,
              );
            }
          }

          totalPoints += itemRef.points;

          sectionItemsSnapshot.push({
            id: itemRef.id,
            questionBankItemId: itemRef.questionBankItemId,
            questionVersionId: resolvedVersion.id,
            versionNumber: resolvedVersion.versionNumber,
            type: resolvedVersion.type,
            title: resolvedVersion.title,
            prompt: resolvedVersion.prompt,
            content: resolvedVersion.content,
            answerKey: resolvedVersion.answerKey,
            rubric: resolvedVersion.rubric,
            config: resolvedVersion.config,
            points: itemRef.points,
            isRequired: itemRef.isRequired,
            orderIndex: itemRef.orderIndex,
          });

          versionItemsToCreate.push({
            questionVersionId: resolvedVersion.id,
            orderIndex: globalItemOrder++,
            points: itemRef.points,
          });
        }

        snapshotSections.push({
          id: section.id,
          title: section.title,
          description: section.description,
          orderIndex: section.orderIndex,
          items: sectionItemsSnapshot,
        });
      }

      if (totalPoints <= 0) {
        throw new BadRequestException(
          `Cannot publish assessment '${id}': total points must be greater than 0.`,
        );
      }

      // 4. Resolve next versionNumber
      const latestVer = await tx.assessmentVersion.findFirst({
        where: { assessmentDefinitionId: id },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const nextVersionNumber = (latestVer?.versionNumber ?? 0) + 1;

      // 5. Construct canonical blueprint snapshot
      const snapshot = {
        assessmentDefinitionId: id,
        versionNumber: nextVersionNumber,
        title: definition.title,
        description: definition.description,
        instructions: definition.instructions,
        durationMinutes: definition.durationMinutes,
        passingScore: definition.passingScore,
        maxAttempts: definition.maxAttempts,
        feedbackPolicy: definition.feedbackPolicy,
        totalPoints,
        itemCount: totalItemsCount,
        sections: snapshotSections,
      };

      // 6. Create immutable AssessmentVersion
      const published = await tx.assessmentVersion.create({
        data: {
          assessmentDefinitionId: id,
          versionNumber: nextVersionNumber,
          title: definition.title,
          description: definition.description,
          instructions: definition.instructions,
          durationMinutes: definition.durationMinutes,
          passingScore: definition.passingScore,
          maxAttempts: definition.maxAttempts,
          feedbackPolicy: definition.feedbackPolicy,
          totalPoints,
          itemCount: totalItemsCount,
          snapshot: snapshot as Prisma.InputJsonValue,
          draftRevision: definition.revision,
          createdById: userId,
        },
      });

      // 7. Relational linkages in AssessmentVersionItem (ensures FK restrict on referenced QuestionVersions)
      for (const itemToLink of versionItemsToCreate) {
        await tx.assessmentVersionItem.create({
          data: {
            assessmentVersionId: published.id,
            questionVersionId: itemToLink.questionVersionId,
            orderIndex: itemToLink.orderIndex,
            points: itemToLink.points,
          },
        });
      }

      // 8. Update AssessmentDefinition metadata
      await tx.assessmentDefinition.update({
        where: { id },
        data: {
          publishedVersionCount: { increment: 1 },
          status: 'PUBLISHED',
        },
      });

      this.logger.log(
        `Published AssessmentVersion '${published.id}' (v${nextVersionNumber}) for assessment '${id}'. Total points: ${totalPoints}, Items: ${totalItemsCount}.`,
      );

      return this.mapVersionToDto(published);
    });
  }

  /**
   * Lists published AssessmentVersions for an assessment.
   */
  async listVersions(assessmentId: string, userId: string): Promise<AssessmentVersionDto[]> {
    await this.verifyAssessmentOwnership(assessmentId, userId);

    const versions = await this.prisma.assessmentVersion.findMany({
      where: { assessmentDefinitionId: assessmentId },
      orderBy: { versionNumber: 'asc' },
    });

    return versions.map((v) => this.mapVersionToDto(v));
  }

  /**
   * Retrieves a specific published AssessmentVersion.
   */
  async getVersion(
    assessmentId: string,
    versionNumber: number,
    userId: string,
  ): Promise<AssessmentVersionDto> {
    await this.verifyAssessmentOwnership(assessmentId, userId);

    const version = await this.prisma.assessmentVersion.findUnique({
      where: {
        assessmentDefinitionId_versionNumber: {
          assessmentDefinitionId: assessmentId,
          versionNumber,
        },
      },
    });

    if (!version) {
      throw new NotFoundException(
        `AssessmentVersion v${versionNumber} not found for assessment '${assessmentId}'.`,
      );
    }

    return this.mapVersionToDto(version);
  }

  /**
   * Generates a sanitized learner-facing assessment preview.
   * Strips all secret answer keys, correct option IDs, and educator-only rubrics.
   */
  async getSanitizedLearnerPreview(
    assessmentId: string,
    versionNumber: number,
  ): Promise<SanitizedLearnerAssessmentPreviewDto> {
    const version = await this.prisma.assessmentVersion.findUnique({
      where: {
        assessmentDefinitionId_versionNumber: {
          assessmentDefinitionId: assessmentId,
          versionNumber,
        },
      },
    });

    if (!version) {
      throw new NotFoundException(
        `AssessmentVersion v${versionNumber} not found for assessment '${assessmentId}'.`,
      );
    }

    const snapshot = version.snapshot as any;
    const sanitizedSections: any[] = [];

    for (const section of snapshot.sections || []) {
      const sanitizedItems: SanitizedLearnerQuestionPreviewDto[] = [];

      for (const item of section.items || []) {
        const sanitizedContent = this.questionTypesRegistry.sanitizeForLearner(
          item.type,
          item.content as Record<string, unknown>,
        );

        sanitizedItems.push({
          id: item.id,
          type: item.type,
          title: item.title,
          prompt: item.prompt,
          content: sanitizedContent, // No answerKey! No rubric! No solution derivations!
          points: item.points,
          orderIndex: item.orderIndex,
          isRequired: item.isRequired,
        });
      }

      sanitizedSections.push({
        id: section.id,
        title: section.title,
        description: section.description,
        orderIndex: section.orderIndex,
        items: sanitizedItems,
      });
    }

    return {
      id: version.id,
      assessmentDefinitionId: version.assessmentDefinitionId,
      versionNumber: version.versionNumber,
      title: version.title,
      description: version.description,
      instructions: version.instructions,
      durationMinutes: version.durationMinutes,
      passingScore: version.passingScore,
      totalPoints: version.totalPoints,
      itemCount: version.itemCount,
      sections: sanitizedSections,
    };
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

  private async verifyAssessmentOwnership(assessmentId: string, userId: string): Promise<void> {
    const assessment = await this.prisma.assessmentDefinition.findUnique({
      where: { id: assessmentId },
      select: { ownerId: true },
    });

    if (!assessment) {
      throw new NotFoundException(`AssessmentDefinition '${assessmentId}' not found.`);
    }

    if (assessment.ownerId !== userId) {
      throw new ForbiddenException(`You do not have access to AssessmentDefinition '${assessmentId}'.`);
    }
  }

  private mapDefinitionToDto(def: any): AssessmentDefinitionDto {
    return {
      id: def.id,
      ownerId: def.ownerId,
      courseId: def.courseId,
      title: def.title,
      description: def.description,
      instructions: def.instructions,
      durationMinutes: def.durationMinutes,
      passingScore: def.passingScore,
      maxAttempts: def.maxAttempts,
      feedbackPolicy: def.feedbackPolicy,
      status: def.status,
      revision: def.revision,
      publishedVersionCount: def.publishedVersionCount,
      sections: (def.sections || []).map((s: any) => this.mapSectionToDto(s)),
      createdAt: def.createdAt.toISOString(),
      updatedAt: def.updatedAt.toISOString(),
    };
  }

  private mapSectionToDto(s: any): AssessmentSectionDto {
    return {
      id: s.id,
      assessmentDefinitionId: s.assessmentDefinitionId,
      title: s.title,
      description: s.description,
      orderIndex: s.orderIndex,
      items: (s.items || []).map((i: any) => this.mapItemRefToDto(i)),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  private mapItemRefToDto(item: any): AssessmentItemRefDto {
    return {
      id: item.id,
      sectionId: item.sectionId,
      questionBankItemId: item.questionBankItemId,
      pinnedQuestionVersionId: item.pinnedQuestionVersionId,
      orderIndex: item.orderIndex,
      points: item.points,
      isRequired: item.isRequired,
      questionItem: item.questionBankItem
        ? {
            id: item.questionBankItem.id,
            title: item.questionBankItem.title,
            type: item.questionBankItem.type,
            prompt: item.questionBankItem.prompt,
            defaultPoints: item.questionBankItem.defaultPoints,
            skillCode: item.questionBankItem.skillCode,
          }
        : undefined,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private mapVersionToDto(v: any): AssessmentVersionDto {
    return {
      id: v.id,
      assessmentDefinitionId: v.assessmentDefinitionId,
      versionNumber: v.versionNumber,
      title: v.title,
      description: v.description,
      instructions: v.instructions,
      durationMinutes: v.durationMinutes,
      passingScore: v.passingScore,
      maxAttempts: v.maxAttempts,
      feedbackPolicy: v.feedbackPolicy,
      totalPoints: v.totalPoints,
      itemCount: v.itemCount,
      snapshot: v.snapshot as Record<string, unknown>,
      draftRevision: v.draftRevision,
      createdById: v.createdById,
      createdAt: v.createdAt.toISOString(),
    };
  }
}
