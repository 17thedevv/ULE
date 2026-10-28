import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { HealthController } from '../src/modules/health/health.controller';
import { HealthService } from '../src/modules/health/health.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('Health API (e2e)', () => {
  let app: INestApplication;
  const mockPrismaService = {
    ping: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1/health returns 200 and valid contract when healthy', async () => {
    mockPrismaService.ping.mockResolvedValueOnce({
      connected: true,
      latencyMs: 2,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(HttpStatus.OK);

    expect(response.body).toMatchObject({
      status: 'ok',
      version: 'v1',
      database: {
        status: 'up',
        latencyMs: 2,
      },
    });
    expect(typeof response.body.timestamp).toBe('string');
    expect(typeof response.body.uptimeSeconds).toBe('number');
  });

  it('GET /api/v1/health returns 503 and degraded status when database is down', async () => {
    mockPrismaService.ping.mockResolvedValueOnce({
      connected: false,
      latencyMs: 5,
      error: 'Database service is currently unreachable',
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(HttpStatus.SERVICE_UNAVAILABLE);

    expect(response.body).toMatchObject({
      status: 'degraded',
      version: 'v1',
      database: {
        status: 'down',
        error: 'Database service is currently unreachable',
      },
    });
    // Ensure no raw host, port, or connection strings leak
    expect(response.text).not.toContain('127.0.0.1');
    expect(response.text).not.toContain('5432');
  });

  it('GET /api/v1/not-found returns standardized error response', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/not-found')
      .expect(HttpStatus.NOT_FOUND);

    expect(response.body).toHaveProperty('statusCode', 404);
    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('path', '/api/v1/not-found');
  });
});
