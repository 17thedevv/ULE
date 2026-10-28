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
      course: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      courseDraft: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      courseVersion: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
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
        title: 'Quantum Physics',
        description: 'Intro to quantum mechanics',
        summary: null,
        revision: 1,
        sourceVersionId: null,
        updatedAt: now,
      });

      const result = await service.createCourse('user-a', {
        title: 'Quantum Physics',
        description: 'Intro to quantum mechanics',
      });

      expect(prismaMock.course.create).toHaveBeenCalledWith({
        data: {
          ownerId: 'user-a',
          visibility: 'PRIVATE',
        },
      });

      expect(result.course.visibility).toBe('PRIVATE');
      expect(result.course.ownerId).toBe('user-a');
      expect(result.draft.revision).toBe(1);
    });
  });

  describe('Ownership & Isolation', () => {
    it('throws NotFoundException when User B tries to read User A course', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: 'c-1',
        ownerId: 'user-a', // Owned by User A
        visibility: 'PRIVATE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // User B tries to read User A's course
      await expect(service.getCourse('c-1', 'user-b')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when User B tries to update User A draft', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: 'c-1',
        ownerId: 'user-a',
        visibility: 'PRIVATE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.updateDraft('c-1', 'user-b', { title: 'Hacked' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Optimistic Concurrency Control', () => {
    it('throws ConflictException if expectedRevision does not match current revision', async () => {
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
        title: 'Calculus',
        description: null,
        summary: null,
        revision: 3, // Current revision is 3
        sourceVersionId: null,
        updatedAt: now,
      });

      // Client sends stale revision 2
      await expect(
        service.updateDraft('c-1', 'user-a', {
          title: 'Calculus Updated',
          expectedRevision: 2,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Version Immutability & Ordering', () => {
    it('creates version 1 from draft and assigns versionNumber monotonically', async () => {
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
        title: 'AB', // Only 2 chars
        description: null,
        summary: null,
        revision: 1,
        sourceVersionId: null,
        updatedAt: new Date(),
      });

      await expect(service.createVersion('c-1', 'user-a')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
