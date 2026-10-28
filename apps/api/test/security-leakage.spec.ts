import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { sanitizeLogMessage } from '../src/common/utils/sanitize-error';
import { HealthService } from '../src/modules/health/health.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('Security: Internal Error & Credential Leakage Prevention', () => {
  describe('sanitizeLogMessage Utility', () => {
    it('redacts credentials from PostgreSQL connection strings', () => {
      const sensitive =
        'Failed to connect: postgresql://admin:superSecretPassword123@db.internal.net:5432/ule_prod';
      const sanitized = sanitizeLogMessage(sensitive);

      expect(sanitized).not.toContain('superSecretPassword123');
      expect(sanitized).not.toContain('admin:');
      expect(sanitized).toBe(
        'Failed to connect: postgresql://***:***@db.internal.net:5432/ule_prod',
      );
    });

    it('redacts explicit password and secret parameters', () => {
      const sensitive = 'DB auth failure: user=postgres password=mySecretPass; host=10.0.0.1';
      const sanitized = sanitizeLogMessage(sensitive);

      expect(sanitized).not.toContain('mySecretPass');
      expect(sanitized).toBe('DB auth failure: user=postgres password=***; host=10.0.0.1');
    });
  });

  describe('HealthService Database Readiness Leakage Prevention', () => {
    let healthService: HealthService;
    let mockPrisma: Partial<PrismaService>;

    beforeEach(() => {
      mockPrisma = {
        ping: jest.fn(),
      };
      healthService = new HealthService(mockPrisma as PrismaService);
    });

    it('does not leak raw Prisma exception or connection string in public health check payload', async () => {
      // Simulate raw Prisma driver failure with embedded connection string and driver stack
      (mockPrisma.ping as jest.Mock).mockResolvedValueOnce({
        connected: false,
        latencyMs: 15,
        error:
          'Invalid `prisma.$queryRaw()` invocation: Can\'t reach database at postgresql://postgres:secret@127.0.0.1:5432/ule_dev',
      });

      const response = await healthService.check();

      expect(response.status).toBe('degraded');
      expect(response.database.status).toBe('down');
      // Public response must be a sanitized notice, not the raw driver error
      expect(response.database.error).toBe('Database service is currently unreachable');
      expect(response.database.error).not.toContain('prisma.$queryRaw');
      expect(response.database.error).not.toContain('secret');
      expect(response.database.error).not.toContain('127.0.0.1:5432');
    });
  });

  describe('HttpExceptionFilter Global Leakage Prevention', () => {
    let filter: HttpExceptionFilter;
    let mockResponse: {
      status: jest.Mock;
      json: jest.Mock;
    };
    let mockRequest: Partial<Request>;
    let mockArgumentsHost: ArgumentsHost;

    beforeEach(() => {
      filter = new HttpExceptionFilter();
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      mockRequest = {
        method: 'GET',
        url: '/api/v1/courses',
      };
      mockArgumentsHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse as unknown as Response,
          getRequest: () => mockRequest as unknown as Request,
          getNext: jest.fn(),
        }),
      } as unknown as ArgumentsHost;
    });

    it('masks raw unhandled Error exceptions with generic 500 and prevents message leakage', () => {
      const rawError = new Error(
        'Postgres connection timeout at postgresql://db_user:my_secret_key@10.0.1.2:5432/ule',
      );

      filter.catch(rawError, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledTimes(1);

      const payload = mockResponse.json.mock.calls[0][0];
      expect(payload.statusCode).toBe(500);
      expect(payload.message).toBe('Internal server error');
      expect(payload.error).toBe('Internal Server Error');
      expect(payload.path).toBe('/api/v1/courses');

      // Crucial assertion: sensitive details never leak into client payload
      expect(JSON.stringify(payload)).not.toContain('my_secret_key');
      expect(payload).not.toHaveProperty('stack');
    });

    it('masks 500 InternalServerErrorException messages to prevent accidental leakage', () => {
      const internalException = new InternalServerErrorException(
        'SQL error: table "secret_keys" does not exist in schema public',
      );

      filter.catch(internalException, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const payload = mockResponse.json.mock.calls[0][0];
      expect(payload.message).toBe('Internal server error');
      expect(payload.error).toBe('Internal Server Error');
      expect(JSON.stringify(payload)).not.toContain('secret_keys');
    });

    it('allows client-safe 4xx HTTP exceptions (e.g. 404, 400 validation) to pass intended messages', () => {
      const notFoundException = new HttpException(
        'Resource not found',
        HttpStatus.NOT_FOUND,
      );

      filter.catch(notFoundException, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      const payload = mockResponse.json.mock.calls[0][0];
      expect(payload.statusCode).toBe(404);
      expect(payload.message).toBe('Resource not found');
    });
  });
});
