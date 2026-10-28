import 'reflect-metadata';
import { HealthService } from '../src/modules/health/health.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('Prisma & PostgreSQL Real Integration Test', () => {
  let prisma: PrismaService;
  let healthService: HealthService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    healthService = new HealthService(prisma);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.onModuleDestroy();
    }
  });

  it('connects to real PostgreSQL and executes active ping successfully', async () => {
    const ping = await prisma.ping();
    expect(ping.connected).toBe(true);
    expect(typeof ping.latencyMs).toBe('number');
    expect(ping.error).toBeUndefined();
  });

  it('creates, queries, and deletes records in the migrated provisional_migration_probes table', async () => {
    const note = `Integration test probe ${Date.now()}`;

    // 1. Insert
    const created = await prisma.provisionalMigrationProbe.create({
      data: { probeNote: note },
    });
    expect(created.id).toBeDefined();
    expect(created.probeNote).toBe(note);
    expect(created.probedAt).toBeInstanceOf(Date);

    // 2. Query
    const retrieved = await prisma.provisionalMigrationProbe.findUnique({
      where: { id: created.id },
    });
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(created.id);
    expect(retrieved?.probeNote).toBe(note);

    // 3. Clean up
    const deleted = await prisma.provisionalMigrationProbe.delete({
      where: { id: created.id },
    });
    expect(deleted.id).toBe(created.id);

    const afterDelete = await prisma.provisionalMigrationProbe.findUnique({
      where: { id: created.id },
    });
    expect(afterDelete).toBeNull();
  });

  it('exercises real PostgreSQL relational lifecycle for User, Course, CourseDraft, and CourseVersion', async () => {
    const timestamp = Date.now();
    const email = `author_${timestamp}@ule.internal`;

    // 1. Create real User in PostgreSQL
    const user = await prisma.user.create({
      data: {
        name: 'Integration Author',
        email,
        emailVerified: true,
      },
    });
    expect(user.id).toBeDefined();

    // 2. Create Course and Draft in PostgreSQL transaction
    const { course, draft } = await prisma.$transaction(async (tx) => {
      const c = await tx.course.create({
        data: {
          ownerId: user.id,
          visibility: 'PRIVATE',
        },
      });

      const d = await tx.courseDraft.create({
        data: {
          courseId: c.id,
          title: 'PostgreSQL Relational Systems',
          description: 'ACID transactions, relational keys, and indexes.',
          revision: 1,
        },
      });

      return { course: c, draft: d };
    });

    expect(course.ownerId).toBe(user.id);
    expect(course.visibility).toBe('PRIVATE');
    expect(draft.courseId).toBe(course.id);
    expect(draft.revision).toBe(1);

    // 3. Create CourseVersion 1 snapshot in PostgreSQL
    const v1 = await prisma.courseVersion.create({
      data: {
        courseId: course.id,
        versionNumber: 1,
        title: draft.title,
        description: draft.description,
        snapshot: {
          title: draft.title,
          description: draft.description,
          schemaVersion: '1.0.0',
        },
        schemaVersion: '1.0.0',
        draftRevision: draft.revision,
        createdById: user.id,
      },
    });
    expect(v1.versionNumber).toBe(1);

    // 4. Verify unique constraint: inserting duplicate versionNumber 1 for same course throws
    await expect(
      prisma.courseVersion.create({
        data: {
          courseId: course.id,
          versionNumber: 1, // Duplicate version number!
          title: 'Duplicate Attempt',
          snapshot: {},
          schemaVersion: '1.0.0',
          draftRevision: draft.revision,
          createdById: user.id,
        },
      }),
    ).rejects.toThrow();

    // 5. Clean up user (cascades to course, draft, and versions)
    // First remove version due to restrict on createdBy
    await prisma.courseVersion.delete({ where: { id: v1.id } });
    await prisma.user.delete({ where: { id: user.id } });

    // Verify course was cascaded
    const courseAfterDelete = await prisma.course.findUnique({
      where: { id: course.id },
    });
    expect(courseAfterDelete).toBeNull();
  });

  it('HealthService reports status "ok" and database status "up" with live database', async () => {
    const health = await healthService.check();

    expect(health.status).toBe('ok');
    expect(health.version).toBe('v1');
    expect(health.database.status).toBe('up');
    expect(typeof health.database.latencyMs).toBe('number');
    expect(health.database.error).toBeUndefined();
  });
});
