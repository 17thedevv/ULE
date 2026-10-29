import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DraftBlockInstanceDto,
  DraftValidationResponseDto,
} from '@ule/contracts';
import { DraftBlockInstance, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddDraftBlockDto } from './dto/add-draft-block.dto';
import { ReorderDraftBlocksDto } from './dto/reorder-draft-blocks.dto';
import { UpdateDraftBlockDto } from './dto/update-draft-block.dto';
import { BlockTypeRegistry } from './registry/block-type.registry';

@Injectable()
export class DraftBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: BlockTypeRegistry,
  ) {}

  /**
   * Authorizes that the user owns the specified course and returns the draft.
   * Throws 404 if course not found or owned by another user.
   */
  private async getOwnedDraft(courseId: string, userId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { draft: true },
    });

    if (!course || course.ownerId !== userId || !course.draft) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }

    return course.draft;
  }

  /**
   * Lists all configured activity block instances for an owned course draft.
   */
  async listDraftBlocks(
    courseId: string,
    userId: string,
  ): Promise<DraftBlockInstanceDto[]> {
    const draft = await this.getOwnedDraft(courseId, userId);

    const blocks = await this.prisma.draftBlockInstance.findMany({
      where: { draftId: draft.id },
      orderBy: { orderIndex: 'asc' },
    });

    return blocks.map((b) => this.toDto(b));
  }

  /**
   * Retrieves a single draft block instance by ID.
   */
  async getDraftBlock(
    courseId: string,
    blockId: string,
    userId: string,
  ): Promise<DraftBlockInstanceDto> {
    const draft = await this.getOwnedDraft(courseId, userId);

    const block = await this.prisma.draftBlockInstance.findFirst({
      where: { id: blockId, draftId: draft.id },
    });

    if (!block) {
      throw new NotFoundException(`Block '${blockId}' not found in course draft.`);
    }

    return this.toDto(block);
  }

  /**
   * Adds a new validated activity block instance to an owned course draft.
   * Executes under an aggregate row-level lock on the parent course with atomic revision increment.
   */
  async addDraftBlock(courseId: string, userId: string, dto: AddDraftBlockDto, blockId?: string): Promise<DraftBlockInstanceDto> {
    // 1. Resolve block type and schema version from registry
    const typeDef = this.registry.getDefinition(dto.blockTypeId, dto.typeVersion);

    // 2. Validate configuration against developer-defined schema
    const validation = typeDef.validateConfig(dto.config, 'new-block', dto.title);
    if (!validation.valid) {
      throw new BadRequestException(
        `Validation failed for block type '${dto.blockTypeId}' (v${typeDef.manifest.version}): ${validation.errors.join('; ')}`,
      );
    }

    // 3. Atomically acquire aggregate lock, check expected revision, and persist block
    return this.prisma.$transaction(async (tx) => {
      const lockedCourses = await tx.$queryRaw<{ id: string; ownerId: string }[]>`
        SELECT id, "ownerId" AS "ownerId" FROM courses WHERE id = ${courseId} FOR UPDATE
      `;
      if (!lockedCourses || lockedCourses.length === 0 || lockedCourses[0].ownerId !== userId) {
        throw new NotFoundException(`Course '${courseId}' not found.`);
      }

      const draft = await tx.courseDraft.findUnique({
        where: { courseId },
      });
      if (!draft) {
        throw new NotFoundException(`Draft for course '${courseId}' not found.`);
      }

      if (draft.revision !== dto.expectedRevision) {
        throw new ConflictException(
          `Draft revision conflict. Expected revision ${dto.expectedRevision}, but current revision is ${draft.revision}. Please reload before updating.`,
        );
      }

      // Determine orderIndex if not specified
      let orderIndex = dto.orderIndex;
      if (orderIndex === undefined) {
        const lastBlock = await tx.draftBlockInstance.findFirst({
          where: { draftId: draft.id },
          orderBy: { orderIndex: 'desc' },
        });
        orderIndex = lastBlock ? lastBlock.orderIndex + 1 : 0;
      }

      const created = await tx.draftBlockInstance.create({
        data: {
          ...(blockId ? { id: blockId } : {}),
          draftId: draft.id,
          blockTypeId: dto.blockTypeId,
          typeVersion: dto.typeVersion || typeDef.manifest.version,
          title: dto.title.trim(),
          orderIndex,
          config: dto.config as unknown as Prisma.InputJsonValue,
        },
      });

      // Increment draft revision atomically
      await tx.courseDraft.update({
        where: { id: draft.id },
        data: { revision: { increment: 1 } },
      });

      return this.toDto(created);
    });
  }

  /**
   * Updates an existing draft block instance's title or configuration.
   * Executes under an aggregate row-level lock on the parent course with atomic revision increment.
   */
  async updateDraftBlock(
    courseId: string,
    blockId: string,
    userId: string,
    dto: UpdateDraftBlockDto,
  ): Promise<DraftBlockInstanceDto> {
    return this.prisma.$transaction(async (tx) => {
      const lockedCourses = await tx.$queryRaw<{ id: string; ownerId: string }[]>`
        SELECT id, "ownerId" AS "ownerId" FROM courses WHERE id = ${courseId} FOR UPDATE
      `;
      if (!lockedCourses || lockedCourses.length === 0 || lockedCourses[0].ownerId !== userId) {
        throw new NotFoundException(`Course '${courseId}' not found.`);
      }

      const draft = await tx.courseDraft.findUnique({
        where: { courseId },
      });
      if (!draft) {
        throw new NotFoundException(`Draft for course '${courseId}' not found.`);
      }

      if (draft.revision !== dto.expectedRevision) {
        throw new ConflictException(
          `Draft revision conflict. Expected revision ${dto.expectedRevision}, but current revision is ${draft.revision}. Please reload before updating.`,
        );
      }

      const existing = await tx.draftBlockInstance.findFirst({
        where: { id: blockId, draftId: draft.id },
      });

      if (!existing) {
        throw new NotFoundException(`Block '${blockId}' not found in course draft.`);
      }

      // Validate updated configuration if supplied
      if (dto.config !== undefined) {
        const typeDef = this.registry.getDefinition(existing.blockTypeId, existing.typeVersion);
        const validation = typeDef.validateConfig(
          dto.config,
          existing.id,
          dto.title ?? existing.title,
        );
        if (!validation.valid) {
          throw new BadRequestException(
            `Validation failed for block '${blockId}': ${validation.errors.join('; ')}`,
          );
        }
      }

      const updated = await tx.draftBlockInstance.update({
        where: { id: blockId },
        data: {
          title: dto.title !== undefined ? dto.title.trim() : undefined,
          config:
            dto.config !== undefined
              ? (dto.config as unknown as Prisma.InputJsonValue)
              : undefined,
        },
      });

      await tx.courseDraft.update({
        where: { id: draft.id },
        data: { revision: { increment: 1 } },
      });

      return this.toDto(updated);
    });
  }

  /**
   * Removes a block instance from a course draft.
   * Executes under an aggregate row-level lock on the parent course with atomic revision increment.
   */
  async deleteDraftBlock(
    courseId: string,
    blockId: string,
    userId: string,
    expectedRevision: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const lockedCourses = await tx.$queryRaw<{ id: string; ownerId: string }[]>`
        SELECT id, "ownerId" AS "ownerId" FROM courses WHERE id = ${courseId} FOR UPDATE
      `;
      if (!lockedCourses || lockedCourses.length === 0 || lockedCourses[0].ownerId !== userId) {
        throw new NotFoundException(`Course '${courseId}' not found.`);
      }

      const draft = await tx.courseDraft.findUnique({
        where: { courseId },
      });
      if (!draft) {
        throw new NotFoundException(`Draft for course '${courseId}' not found.`);
      }

      if (draft.revision !== expectedRevision) {
        throw new ConflictException(
          `Draft revision conflict. Expected revision ${expectedRevision}, but current revision is ${draft.revision}. Please reload before updating.`,
        );
      }

      const existing = await tx.draftBlockInstance.findFirst({
        where: { id: blockId, draftId: draft.id },
      });

      if (!existing) {
        throw new NotFoundException(`Block '${blockId}' not found in course draft.`);
      }

      await tx.draftBlockInstance.delete({
        where: { id: blockId },
      });

      // Re-index remaining blocks sequentially
      const remaining = await tx.draftBlockInstance.findMany({
        where: { draftId: draft.id },
        orderBy: { orderIndex: 'asc' },
      });

      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].orderIndex !== i) {
          await tx.draftBlockInstance.update({
            where: { id: remaining[i].id },
            data: { orderIndex: i },
          });
        }
      }

      await tx.courseDraft.update({
        where: { id: draft.id },
        data: { revision: { increment: 1 } },
      });
    });
  }

  /**
   * Reorders all blocks in a course draft.
   * Enforces uniqueness of block IDs and executes under an aggregate row-level lock.
   */
  async reorderDraftBlocks(
    courseId: string,
    userId: string,
    dto: ReorderDraftBlocksDto,
  ): Promise<DraftBlockInstanceDto[]> {
    // 1. Guard against duplicate block IDs in input
    const uniqueIds = new Set(dto.blockIds);
    if (uniqueIds.size !== dto.blockIds.length) {
      throw new BadRequestException('Reorder list contains duplicate block IDs.');
    }

    return this.prisma.$transaction(async (tx) => {
      const lockedCourses = await tx.$queryRaw<{ id: string; ownerId: string }[]>`
        SELECT id, "ownerId" AS "ownerId" FROM courses WHERE id = ${courseId} FOR UPDATE
      `;
      if (!lockedCourses || lockedCourses.length === 0 || lockedCourses[0].ownerId !== userId) {
        throw new NotFoundException(`Course '${courseId}' not found.`);
      }

      const draft = await tx.courseDraft.findUnique({
        where: { courseId },
      });
      if (!draft) {
        throw new NotFoundException(`Draft for course '${courseId}' not found.`);
      }

      if (draft.revision !== dto.expectedRevision) {
        throw new ConflictException(
          `Draft revision conflict. Expected revision ${dto.expectedRevision}, but current revision is ${draft.revision}. Please reload before updating.`,
        );
      }

      const blocks = await tx.draftBlockInstance.findMany({
        where: { draftId: draft.id },
      });

      if (blocks.length !== dto.blockIds.length) {
        throw new BadRequestException(
          `Reorder list must contain all ${blocks.length} block IDs in the draft.`,
        );
      }

      const existingIds = new Set(blocks.map((b) => b.id));
      for (const id of dto.blockIds) {
        if (!existingIds.has(id)) {
          throw new BadRequestException(
            `Block ID '${id}' is not part of this draft.`,
          );
        }
      }

      // Update orderIndex for each block
      for (let i = 0; i < dto.blockIds.length; i++) {
        await tx.draftBlockInstance.update({
          where: { id: dto.blockIds[i] },
          data: { orderIndex: i },
        });
      }

      await tx.courseDraft.update({
        where: { id: draft.id },
        data: { revision: { increment: 1 } },
      });

      const reordered = await tx.draftBlockInstance.findMany({
        where: { draftId: draft.id },
        orderBy: { orderIndex: 'asc' },
      });

      return reordered.map((b) => this.toDto(b));
    });
  }

  /**
   * Validates all block instances in the draft against their developer-defined schemas.
   */
  async validateDraftBlocks(
    courseId: string,
    userId: string,
  ): Promise<DraftValidationResponseDto> {
    const draft = await this.getOwnedDraft(courseId, userId);

    const blocks = await this.prisma.draftBlockInstance.findMany({
      where: { draftId: draft.id },
      orderBy: { orderIndex: 'asc' },
    });

    const results = blocks.map((block) => {
      if (!this.registry.hasType(block.blockTypeId, block.typeVersion)) {
        return {
          blockId: block.id,
          title: block.title,
          blockTypeId: block.blockTypeId,
          valid: false,
          errors: [
            `Block type '${block.blockTypeId}' version '${block.typeVersion}' is not supported. Supported versions: ${this.registry.getSupportedVersions(block.blockTypeId).join(', ')}`,
          ],
        };
      }
      return this.registry.validateConfig(
        block.blockTypeId,
        block.config,
        block.id,
        block.title,
        block.typeVersion,
      );
    });

    const invalidCount = results.filter((r) => !r.valid).length;

    return {
      valid: invalidCount === 0,
      totalBlocks: blocks.length,
      invalidBlocksCount: invalidCount,
      blocks: results,
    };
  }

  public toDto(entity: DraftBlockInstance): DraftBlockInstanceDto {
    return {
      id: entity.id,
      draftId: entity.draftId,
      blockTypeId: entity.blockTypeId,
      typeVersion: entity.typeVersion,
      title: entity.title,
      orderIndex: entity.orderIndex,
      config: entity.config as Record<string, unknown>,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
