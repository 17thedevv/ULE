/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CoursesService } from '../src/modules/courses/courses.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('CoursesService (Unit Tests)', () => {
  let service: CoursesService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'c-1' }]),
      course: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      courseDraft: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      courseVersion: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      draftBlockInstance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    service = new CoursesService(prismaMock as unknown as PrismaService);
  });

  describe('createCourse', () => {
    it('creates a private course and initial draft revision 1', async () => {
      const now = new Date();
      prismaMock.course.create.mockResolvedValue({
        id: 'c-1',
        ownerId: 'user-a',
        visibility: 'PRIVATE',
        createdAt: now,
        updatedAt: now,
      });

      prismaMock.courseDraft.create.mockResolvedValue({
        id: 'd-1',
        courseId: 'c-1',
        title: 'Draft Title',
        description: 'Draft Description',
        summary: 'Draft Summary',
        revision: 1,
        sourceVersionId: null,
        updatedAt: now,
      });

      const result = await service.createCourse('user-a', {
        title: 'Draft Title',
        description: 'Draft Description',
        summary: 'Draft Summary',
      });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.course.create).toHaveBeenCalledWith({
        data: {
          ownerId: 'user-a',
          visibility: 'PRIVATE',
        },
      });
      expect(prismaMock.courseDraft.create).toHaveBeenCalledWith({
        data: {
          courseId: 'c-1',
          title: 'Draft Title',
          description: 'Draft Description',
          summary: 'Draft Summary',
          revision: 1,
        },
      });

      expect(result.course.id).toBe('c-1');
      expect(result.course.visibility).toBe('PRIVATE');
      expect(result.draft.title).toBe('Draft Title');
      expect(result.draft.revision).toBe(1);
    });
  });

  describe('Draft Concurrency & Revisions', () => {
    it('updates draft title and increments revision when expectedRevision matches', async () => {
      const now = new Date();
      prismaMock.course.findUnique.mockResolvedValue({
        id: 'c-1',
        ownerId: 'user-a',
        visibility: 'PRIVATE',
        createdAt: now,
        updatedAt: now,
      });

      prismaMock.courseDraft.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.courseDraft.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1',
        courseId: 'c-1',
        title: 'New Title',
        description: null,
        summary: null,
        revision: 2,
        sourceVersionId: null,
        updatedAt: now,
      });

      const updated = await service.updateDraft('c-1', 'user-a', {
        title: 'New Title',
        expectedRevision: 1,
      });

      expect(prismaMock.courseDraft.updateMany).toHaveBeenCalledWith({
        where: {
          courseId: 'c-1',
          revision: 1,
        },
        data: {
          title: 'New Title',
          revision: { increment: 1 },
        },
      });
      expect(updated.title).toBe('New Title');
      expect(updated.revision).toBe(2);
    });

    it('rejects stale draft update with 409 ConflictException when revision does not match', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: 'c-1',
        ownerId: 'user-a',
        visibility: 'PRIVATE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      prismaMock.courseDraft.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.courseDraft.findUnique.mockResolvedValue({
        id: 'd-1',
        courseId: 'c-1',
        revision: 3,
      });

      await expect(
        service.updateDraft('c-1', 'user-a', {
          title: 'Conflicting Title',
          expectedRevision: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Version Immutability & Ordering', () => {
    it('creates version 1 from draft and assigns versionNumber monotonically under row lock', async () => {
      const now = new Date();
      prismaMock.course.findUnique.mockResolvedValue({
        id: 'c-1',
        ownerId: 'user-a',
        visibility: 'PRIVATE',
        createdAt: now,
        updatedAt: now,
      });

      prismaMock.courseDraft.findUnique.mockResolvedValue({
        id: 'd-1',
        courseId: 'c-1',
        title: 'Valid Draft Title',
        description: 'Description',
        summary: null,
        revision: 2,
        sourceVersionId: null,
        updatedAt: now,
      });

      // No prior versions
      prismaMock.courseVersion.findFirst.mockResolvedValue(null);

      prismaMock.courseVersion.create.mockResolvedValue({
        id: 'v-1',
        courseId: 'c-1',
        versionNumber: 1,
        title: 'Valid Draft Title',
        description: 'Description',
        summary: null,
        snapshot: {
          title: 'Valid Draft Title',
          schemaVersion: '1.0.0',
        },
        schemaVersion: '1.0.0',
        draftRevision: 2,
        createdById: 'user-a',
        createdAt: now,
      });

      const version = await service.createVersion('c-1', 'user-a');

      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(version.versionNumber).toBe(1);
      expect(version.draftRevision).toBe(2);
      expect(prismaMock.courseDraft.update).toHaveBeenCalledWith({
        where: { courseId: 'c-1' },
        data: { sourceVersionId: 'v-1' },
      });
    });

    it('rejects version creation if draft title is invalid (< 3 chars)', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: 'c-1',
        ownerId: 'user-a',
        visibility: 'PRIVATE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      prismaMock.courseDraft.findUnique.mockResolvedValue({
        id: 'd-1',
        courseId: 'c-1',
        title: 'ab',
        revision: 1,
      });

      await expect(service.createVersion('c-1', 'user-a')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Cross-User Access Isolation', () => {
    it('returns 404 for Course if requested by non-owner user', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: 'c-1',
        ownerId: 'user-a',
        visibility: 'PRIVATE',
      });

      await expect(service.getCourse('c-1', 'user-attacker')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns 404 for Draft if requested by non-owner user', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: 'c-1',
        ownerId: 'user-a',
        visibility: 'PRIVATE',
      });

      await expect(service.getDraft('c-1', 'user-attacker')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
