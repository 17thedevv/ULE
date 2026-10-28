import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { HealthController } from '../src/modules/health/health.controller';
import { HealthService } from '../src/modules/health/health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthServiceMock: { check: jest.Mock };
  let responseMock: Partial<Response>;

  beforeEach(async () => {
    healthServiceMock = {
      check: jest.fn(),
    };

    responseMock = {
      status: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: healthServiceMock,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return 200 and health payload when system is healthy', async () => {
    const mockHealth = {
      status: 'ok' as const,
      timestamp: '2026-10-27T14:00:00.000Z',
      version: 'v1',
      uptimeSeconds: 50,
      database: { status: 'up' as const, latencyMs: 2 },
    };
    healthServiceMock.check.mockResolvedValue(mockHealth);

    const result = await controller.getHealth(responseMock as Response);

    expect(result).toEqual(mockHealth);
    expect(responseMock.status).not.toHaveBeenCalled();
  });

  it('should set status 503 Service Unavailable when system is degraded', async () => {
    const mockDegraded = {
      status: 'degraded' as const,
      timestamp: '2026-10-27T14:00:00.000Z',
      version: 'v1',
      uptimeSeconds: 50,
      database: { status: 'down' as const, error: 'DB down' },
    };
    healthServiceMock.check.mockResolvedValue(mockDegraded);

    const result = await controller.getHealth(responseMock as Response);

    expect(result).toEqual(mockDegraded);
    expect(responseMock.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
