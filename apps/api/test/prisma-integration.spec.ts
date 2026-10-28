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

  it('HealthService reports status "ok" and database status "up" with live database', async () => {
    const health = await healthService.check();

    expect(health.status).toBe('ok');
    expect(health.version).toBe('v1');
    expect(health.database.status).toBe('up');
    expect(typeof health.database.latencyMs).toBe('number');
    expect(health.database.error).toBeUndefined();
  });
});
