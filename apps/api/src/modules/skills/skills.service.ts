import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseSkillDto, DraftSkillMappingDto } from '@ule/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseSkillDto } from './dto/create-skill.dto';
import { UpsertDraftSkillMappingDto } from './dto/upsert-skill-mapping.dto';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Defines a new course-scoped skill under Course Owner authority.
   * Enforces course-scoped identity uniqueness on skillCode.
   */
  async createSkill(
    ownerId: string,
    courseId: string,
    dto: CreateCourseSkillDto,
  ): Promise<CourseSkillDto> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course || course.ownerId !== ownerId) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }

    const existingSkill = await this.prisma.courseSkill.findUnique({
      where: {
        courseId_skillCode: {
          courseId,
          skillCode: dto.skillCode.trim(),
        },
      },
    });

    if (existingSkill) {
      throw new ConflictException(
        `Skill code '${dto.skillCode.trim()}' already exists in this course.`,
      );
    }

    const skill = await this.prisma.courseSkill.create({
      data: {
        courseId,
        skillCode: dto.skillCode.trim(),
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
      },
    });

    return {
      id: skill.id,
      courseId: skill.courseId,
      skillCode: skill.skillCode,
      name: skill.name,
      description: skill.description,
      revision: skill.revision,
      createdAt: skill.createdAt.toISOString(),
      updatedAt: skill.updatedAt.toISOString(),
    };
  }

  /**
   * Lists all course-scoped skills for a given course.
   */
  async listSkills(ownerId: string, courseId: string): Promise<CourseSkillDto[]> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course || course.ownerId !== ownerId) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }

    const skills = await this.prisma.courseSkill.findMany({
      where: { courseId },
      orderBy: { createdAt: 'asc' },
    });

    return skills.map((s) => ({
      id: s.id,
      courseId: s.courseId,
      skillCode: s.skillCode,
      name: s.name,
      description: s.description,
      revision: s.revision,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  /**
   * Maps an authored activity block or item to a course-scoped skill on the editable draft.
   * Uses row-level locking on the parent course and validates draft expectedRevision.
   */
  async upsertDraftSkillMapping(
    ownerId: string,
    courseId: string,
    dto: UpsertDraftSkillMappingDto,
  ): Promise<DraftSkillMappingDto> {
    return this.prisma.$transaction(async (tx) => {
      // Row-level lock on course
      const locked = await tx.$queryRaw<{ id: string; ownerId: string }[]>`
        SELECT id, "ownerId" AS "ownerId" FROM courses WHERE id = ${courseId} FOR UPDATE
      `;

      if (!locked || locked.length === 0 || locked[0].ownerId !== ownerId) {
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
          `Draft revision conflict. Expected revision ${dto.expectedRevision}, but draft is at revision ${draft.revision}.`,
        );
      }

      // Validate block instance exists in this draft
      const block = await tx.draftBlockInstance.findFirst({
        where: { id: dto.blockInstanceId, draftId: draft.id },
      });

      if (!block) {
        throw new BadRequestException(
          `Block instance '${dto.blockInstanceId}' does not exist in draft '${draft.id}'.`,
        );
      }

      // Validate skill exists in this course
      const skill = await tx.courseSkill.findFirst({
        where: { id: dto.skillId, courseId },
      });

      if (!skill) {
        throw new BadRequestException(
          `Course skill '${dto.skillId}' does not exist in course '${courseId}'.`,
        );
      }

      const itemKey = dto.itemKey?.trim() || 'default';
      const criterion = dto.criterion?.trim() || 'CORRECT_RESPONSE';
      const weight = dto.weight !== undefined ? dto.weight : 1.0;

      const mapping = await tx.draftSkillMapping.upsert({
        where: {
          draftId_blockInstanceId_skillId_itemKey: {
            draftId: draft.id,
            blockInstanceId: dto.blockInstanceId,
            skillId: dto.skillId,
            itemKey,
          },
        },
        create: {
          draftId: draft.id,
          blockInstanceId: dto.blockInstanceId,
          skillId: dto.skillId,
          itemKey,
          criterion,
          weight,
          revision: 1,
        },
        update: {
          criterion,
          weight,
          revision: { increment: 1 },
        },
        include: { skill: true },
      });

      await tx.courseDraft.update({
        where: { id: draft.id },
        data: { revision: { increment: 1 } },
      });

      return {
        id: mapping.id,
        draftId: mapping.draftId,
        blockInstanceId: mapping.blockInstanceId,
        skillId: mapping.skillId,
        skillCode: mapping.skill.skillCode,
        skillName: mapping.skill.name,
        itemKey: mapping.itemKey,
        criterion: mapping.criterion,
        weight: mapping.weight,
        revision: mapping.revision,
        createdAt: mapping.createdAt.toISOString(),
        updatedAt: mapping.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Lists all skill mappings on the current editable draft.
   */
  async listDraftSkillMappings(
    ownerId: string,
    courseId: string,
  ): Promise<DraftSkillMappingDto[]> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { draft: true },
    });

    if (!course || course.ownerId !== ownerId) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }

    if (!course.draft) {
      throw new NotFoundException(`Draft for course '${courseId}' not found.`);
    }

    const mappings = await this.prisma.draftSkillMapping.findMany({
      where: { draftId: course.draft.id },
      include: { skill: true },
      orderBy: { createdAt: 'asc' },
    });

    return mappings.map((m) => ({
      id: m.id,
      draftId: m.draftId,
      blockInstanceId: m.blockInstanceId,
      skillId: m.skillId,
      skillCode: m.skill.skillCode,
      skillName: m.skill.name,
      itemKey: m.itemKey,
      criterion: m.criterion,
      weight: m.weight,
      revision: m.revision,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));
  }
}
