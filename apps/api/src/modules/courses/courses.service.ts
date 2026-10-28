import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CourseDto,
  CourseDraftDto,
  CourseVersionDto,
  CreateCourseResponse,
} from '@ule/contracts';
import { Course, CourseDraft, CourseVersion, Prisma } from '@prisma/client';
import { BlockTypeRegistry } from '../abp/registry/block-type.registry';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDraftDto } from './dto/update-draft.dto';

@Injectable()
export class CoursesService {
  private readonly registry: BlockTypeRegistry;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() registry?: BlockTypeRegistry,
  ) {
    this.registry = registry ?? new BlockTypeRegistry();
  }

  /**
   * Creates a new Course and its initial editable Draft under authoritative user ownership.
   * By invariant, a newly created course is always PRIVATE.
   */
  async createCourse(
    ownerId: string,
    dto: CreateCourseDto,
  ): Promise<CreateCourseResponse> {
    return this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          ownerId,
          visibility: 'PRIVATE',
        },
      });

      const draft = await tx.courseDraft.create({
        data: {
          courseId: course.id,
          title: dto.title.trim(),
          description: dto.description?.trim() ?? null,
          summary: dto.summary?.trim() ?? null,
          revision: 1,
        },
      });

      return {
        course: this.toCourseDto(course),
        draft: this.toDraftDto(draft),
      };
    });
  }

  /**
   * Lists all courses owned by the authenticated user.
   */
  async listCourses(userId: string): Promise<CourseDto[]> {
    const courses = await this.prisma.course.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
    });

    return courses.map((course) => this.toCourseDto(course));
  }

  /**
   * Reads an owned Course by ID.
   * Returns 404 if not found OR if owned by another user (preventing private course discovery).
   */
  async getCourse(courseId: string, userId: string): Promise<CourseDto> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course || course.ownerId !== userId) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }

    return this.toCourseDto(course);
  }

  /**
   * Reads the current editable Draft for an owned Course.
   */
  async getDraft(courseId: string, userId: string): Promise<CourseDraftDto> {
    await this.getCourse(courseId, userId);

    const draft = await this.prisma.courseDraft.findUnique({
      where: { courseId },
    });

    if (!draft) {
      throw new NotFoundException(`Draft for course '${courseId}' not found.`);
    }

    return this.toDraftDto(draft);
  }

  /**
   * Modifies permitted draft fields with atomic optimistic concurrency control.
   * Compares expectedRevision and mutates atomically in PostgreSQL.
   */
  async updateDraft(
    courseId: string,
    userId: string,
    dto: UpdateCourseDraftDto,
  ): Promise<CourseDraftDto> {
    await this.getCourse(courseId, userId);

    return this.prisma.$transaction(async (tx) => {
      // Perform atomic conditional update matching exact expectedRevision
      const updateResult = await tx.courseDraft.updateMany({
        where: {
          courseId,
          revision: dto.expectedRevision,
        },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() }
            : {}),
          ...(dto.summary !== undefined ? { summary: dto.summary.trim() } : {}),
          revision: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const existing = await tx.courseDraft.findUnique({
          where: { courseId },
        });

        if (!existing) {
          throw new NotFoundException(`Draft for course '${courseId}' not found.`);
        }

        throw new ConflictException(
          `Draft revision conflict. Expected revision ${dto.expectedRevision}, but current revision is ${existing.revision}. Please reload before updating.`,
        );
      }

      const updated = await tx.courseDraft.findUniqueOrThrow({
        where: { courseId },
      });

      return this.toDraftDto(updated);
    });
  }

  /**
   * Creates an immutable version snapshot from the validated current draft.
   * Employs PostgreSQL row-level locking on the parent course to serialize version allocation,
   * guaranteeing monotonic version numbering without gaps, duplicate versions, or exposed 500 errors.
   */
  async createVersion(
    courseId: string,
    userId: string,
  ): Promise<CourseVersionDto> {
    await this.getCourse(courseId, userId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Acquire exclusive row-level lock on the parent Course row in PostgreSQL.
        // This serializes version snapshot requests for this course, preventing races.
        await tx.$queryRaw`SELECT id FROM courses WHERE id = ${courseId} FOR UPDATE`;

        const draft = await tx.courseDraft.findUnique({
          where: { courseId },
        });

        if (!draft) {
          throw new NotFoundException(
            `Draft for course '${courseId}' not found.`,
          );
        }

        if (!draft.title || draft.title.trim().length < 3) {
          throw new BadRequestException(
            'Cannot create version: draft title must be at least 3 characters.',
          );
        }

        // Validate all configured draft activity block instances
        const blocks = tx.draftBlockInstance
          ? await tx.draftBlockInstance.findMany({
              where: { draftId: draft.id },
              orderBy: { orderIndex: 'asc' },
            })
          : [];

        const validationErrors: string[] = [];
        for (const block of blocks) {
          if (!this.registry.hasType(block.blockTypeId)) {
            validationErrors.push(
              `Block '${block.title}' (${block.id}) references unrecognized type '${block.blockTypeId}'.`,
            );
            continue;
          }
          const validation = this.registry.validateConfig(
            block.blockTypeId,
            block.config,
            block.id,
            block.title,
          );
          if (!validation.valid) {
            validationErrors.push(
              `Block '${block.title}' (${block.id}) validation failed: ${validation.errors.join('; ')}`,
            );
          }
        }

        if (validationErrors.length > 0) {
          throw new BadRequestException({
            message: 'Cannot create version: Draft contains invalid activity block instances.',
            errors: validationErrors,
          });
        }

        const latestVersion = await tx.courseVersion.findFirst({
          where: { courseId },
          orderBy: { versionNumber: 'desc' },
        });

        const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

        const blocksSnapshot = blocks.map((b) => ({
          id: b.id,
          blockTypeId: b.blockTypeId,
          typeVersion: b.typeVersion,
          title: b.title,
          orderIndex: b.orderIndex,
          config: b.config as Record<string, unknown>,
        }));

        const snapshotData = {
          courseId,
          versionNumber: nextVersionNumber,
          title: draft.title,
          description: draft.description,
          summary: draft.summary,
          schemaVersion: '1.0.0',
          draftRevision: draft.revision,
          createdById: userId,
          createdAt: new Date().toISOString(),
          blocks: blocksSnapshot,
        };

        const version = await tx.courseVersion.create({
          data: {
            courseId,
            versionNumber: nextVersionNumber,
            title: draft.title,
            description: draft.description,
            summary: draft.summary,
            snapshot: snapshotData as unknown as Prisma.InputJsonValue,
            schemaVersion: '1.0.0',
            draftRevision: draft.revision,
            createdById: userId,
          },
        });

        await tx.courseDraft.update({
          where: { courseId },
          data: {
            sourceVersionId: version.id,
          },
        });

        return this.toVersionDto(version);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Concurrent version creation conflict. A version was allocated concurrently; please retry.',
        );
      }
      throw error;
    }
  }

  /**
   * Lists the version history for an owned Course.
   */
  async listVersions(
    courseId: string,
    userId: string,
  ): Promise<CourseVersionDto[]> {
    await this.getCourse(courseId, userId);

    const versions = await this.prisma.courseVersion.findMany({
      where: { courseId },
      orderBy: { versionNumber: 'asc' },
    });

    return versions.map((v) => this.toVersionDto(v));
  }

  /**
   * Reads an exact immutable version snapshot.
   */
  async getVersion(
    courseId: string,
    versionId: string,
    userId: string,
  ): Promise<CourseVersionDto> {
    await this.getCourse(courseId, userId);

    const version = await this.prisma.courseVersion.findFirst({
      where: {
        id: versionId,
        courseId,
      },
    });

    if (!version) {
      throw new NotFoundException(
        `Version '${versionId}' not found for course '${courseId}'.`,
      );
    }

    return this.toVersionDto(version);
  }

  // --- DTO Mappers ---

  private toCourseDto(course: Course): CourseDto {
    return {
      id: course.id,
      ownerId: course.ownerId,
      visibility: course.visibility,
      createdAt: course.createdAt.toISOString(),
      updatedAt: course.updatedAt.toISOString(),
    };
  }

  private toDraftDto(draft: CourseDraft): CourseDraftDto {
    return {
      id: draft.id,
      courseId: draft.courseId,
      title: draft.title,
      description: draft.description,
      summary: draft.summary,
      revision: draft.revision,
      sourceVersionId: draft.sourceVersionId,
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  private toVersionDto(version: CourseVersion): CourseVersionDto {
    return {
      id: version.id,
      courseId: version.courseId,
      versionNumber: version.versionNumber,
      title: version.title,
      description: version.description,
      summary: version.summary,
      snapshot: version.snapshot as Record<string, unknown>,
      schemaVersion: version.schemaVersion,
      draftRevision: version.draftRevision,
      createdById: version.createdById,
      createdAt: version.createdAt.toISOString(),
    };
  }
}
