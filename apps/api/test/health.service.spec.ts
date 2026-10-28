import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from '../src/modules/health/health.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('HealthService', () => {
  let service: HealthService;
  let prismaMock: { ping: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      ping: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should return status "ok" and database status "up" when database ping succeeds', async () => {
    prismaMock.ping.mockResolvedValue({
      connected: true,
      latencyMs: 3,
    });

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.version).toBe('v1');
    expect(result.database.status).toBe('up');
    expect(result.database.latencyMs).toBe(3);
    expect(result.database.error).toBeUndefined();
    expect(typeof result.uptimeSeconds).toBe('number');
    expect(typeof result.timestamp).toBe('string');
  });

  it('should return status "degraded" and database status "down" when database ping fails', async () => {
    prismaMock.ping.mockResolvedValue({
      connected: false,
      latencyMs: 10,
      error: 'Database service is currently unreachable',
    });

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.database.status).toBe('down');
    expect(result.database.latencyMs).toBe(10);
    expect(result.database.error).toBe('Database service is currently unreachable');
  });
});
