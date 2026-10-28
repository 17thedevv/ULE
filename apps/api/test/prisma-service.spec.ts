import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('PrismaService Configuration Requirement', () => {
  const originalEnv = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
  });

  it('throws an informative error if DATABASE_URL is not set', () => {
    delete process.env.DATABASE_URL;

    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(() => new PrismaService(mockConfigService)).toThrow(
      /DATABASE_URL is required but not configured/,
    );
  });

  it('instantiates successfully when DATABASE_URL is explicitly provided', () => {
    process.env.DATABASE_URL =
      'postgresql://testuser:testpass@localhost:5432/testdb?schema=public';

    const service = new PrismaService();
    expect(service).toBeDefined();
  });
});
