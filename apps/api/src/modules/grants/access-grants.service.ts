import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseAccessGrantDto } from '@ule/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccessGrantDto } from './dto/create-access-grant.dto';

@Injectable()
export class AccessGrantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Explicitly grants access to a specific private immutable CourseVersion for a registered Learner.
   * Enforces that the granter is the authoritative course owner.
   */
  async createGrant(
    ownerId: string,
    courseId: string,
    versionId: string,
    dto: CreateAccessGrantDto,
  ): Promise<CourseAccessGrantDto> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course || course.ownerId !== ownerId) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }

    const version = await this.prisma.courseVersion.findFirst({
      where: { id: versionId, courseId },
    });

    if (!version) {
      throw new NotFoundException(
        `CourseVersion '${versionId}' not found in course '${courseId}'.`,
      );
    }

    if (!dto.userId && !dto.email) {
      throw new BadRequestException('Must provide either userId or email.');
    }

    const learner = dto.userId
      ? await this.prisma.user.findUnique({ where: { id: dto.userId } })
      : await this.prisma.user.findUnique({
          where: { email: dto.email!.trim().toLowerCase() },
        });

    if (!learner) {
      throw new NotFoundException('Target learner user not found.');
    }

    if (learner.id === ownerId) {
      throw new BadRequestException(
        'Course owner already holds creator authority and cannot be granted learner access to their own course.',
      );
    }

    const existingGrant = await this.prisma.courseAccessGrant.findUnique({
      where: {
        courseVersionId_userId: {
          courseVersionId: version.id,
          userId: learner.id,
        },
      },
      include: { user: true },
    });

    if (existingGrant) {
      if (existingGrant.status === 'ACTIVE') {
        return this.toGrantDto(existingGrant);
      }

      // Re-activate previously revoked grant
      const reactivated = await this.prisma.courseAccessGrant.update({
        where: { id: existingGrant.id },
        data: {
          status: 'ACTIVE',
          revokedAt: null,
          revokedById: null,
          grantedById: ownerId,
        },
        include: { user: true },
      });

      return this.toGrantDto(reactivated);
    }

    const grant = await this.prisma.courseAccessGrant.create({
      data: {
        courseId,
        courseVersionId: version.id,
        userId: learner.id,
        grantedById: ownerId,
        status: 'ACTIVE',
      },
      include: { user: true },
    });

    return this.toGrantDto(grant);
  }

  /**
   * Lists all grants for a specific immutable CourseVersion (Owner only).
   */
  async listGrantsForVersion(
    ownerId: string,
    courseId: string,
    versionId: string,
  ): Promise<CourseAccessGrantDto[]> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course || course.ownerId !== ownerId) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }

    const version = await this.prisma.courseVersion.findFirst({
      where: { id: versionId, courseId },
    });

    if (!version) {
      throw new NotFoundException(
        `CourseVersion '${versionId}' not found in course '${courseId}'.`,
      );
    }

    const grants = await this.prisma.courseAccessGrant.findMany({
      where: { courseVersionId: version.id },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    return grants.map((g) => this.toGrantDto(g));
  }

  /**
   * Revokes access for a specific grant.
   */
  async revokeGrant(
    ownerId: string,
    courseId: string,
    versionId: string,
    grantId: string,
  ): Promise<CourseAccessGrantDto> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course || course.ownerId !== ownerId) {
      throw new NotFoundException(`Course '${courseId}' not found.`);
    }

    const grant = await this.prisma.courseAccessGrant.findFirst({
      where: { id: grantId, courseVersionId: versionId, courseId },
      include: { user: true },
    });

    if (!grant) {
      throw new NotFoundException(`Access grant '${grantId}' not found.`);
    }

    const updated = await this.prisma.courseAccessGrant.update({
      where: { id: grant.id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedById: ownerId,
      },
      include: { user: true },
    });

    return this.toGrantDto(updated);
  }

  /**
   * Verifies whether a user has active authorization to execute or inspect a CourseVersion.
   * Returns true if user is the course owner OR holds an ACTIVE CourseAccessGrant.
   */
  async hasActiveAccess(courseVersionId: string, userId: string): Promise<boolean> {
    const version = await this.prisma.courseVersion.findUnique({
      where: { id: courseVersionId },
      include: { course: true },
    });

    if (!version) return false;

    if (version.course.ownerId === userId) return true;

    const grant = await this.prisma.courseAccessGrant.findUnique({
      where: {
        courseVersionId_userId: {
          courseVersionId,
          userId,
        },
      },
    });

    return grant?.status === 'ACTIVE';
  }

  private toGrantDto(grant: {
    id: string;
    courseId: string;
    courseVersionId: string;
    userId: string;
    grantedById: string;
    status: 'ACTIVE' | 'REVOKED';
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    user?: { email: string; name: string };
  }): CourseAccessGrantDto {
    return {
      id: grant.id,
      courseId: grant.courseId,
      courseVersionId: grant.courseVersionId,
      userId: grant.userId,
      userEmail: grant.user?.email,
      userName: grant.user?.name,
      grantedById: grant.grantedById,
      status: grant.status,
      revokedAt: grant.revokedAt?.toISOString() ?? null,
      createdAt: grant.createdAt.toISOString(),
      updatedAt: grant.updatedAt.toISOString(),
    };
  }
}
