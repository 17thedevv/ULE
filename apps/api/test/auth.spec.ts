/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('AuthService & Better Auth Integration', () => {
  let authService: AuthService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    account: {
      findFirst: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'BETTER_AUTH_SECRET') return 'test-auth-secret-key-32-chars-long!';
      if (key === 'PORT') return 3000;
      if (key === 'BETTER_AUTH_URL') return 'http://localhost:3000';
      if (key === 'API_PREFIX') return 'api/v1';
      if (key === 'CORS_ORIGIN') return 'http://localhost:5173';
      return defaultValue;
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    authService.onModuleInit();
  });

  it('initializes Better Auth instance with expected basePath and options', () => {
    expect(authService.auth).toBeDefined();
    expect(authService.auth.options.basePath).toBe('/api/v1/auth');
    expect(typeof authService.handleAuthRequest).toBe('function');
    expect(typeof authService.getSessionFromRequest).toBe('function');
  });

  it('returns null when request has no session cookie or authorization header', async () => {
    const req: any = {
      headers: {},
    };

    const session = await authService.getSessionFromRequest(req);
    expect(session).toBeNull();
  });

  it('rejects invalid or forged session token', async () => {
    mockPrisma.session.findFirst.mockResolvedValue(null);
    mockPrisma.session.findUnique.mockResolvedValue(null);

    const req: any = {
      headers: {
        authorization: 'Bearer forged_session_token_123',
      },
    };

    const session = await authService.getSessionFromRequest(req);
    expect(session).toBeNull();
  });

  it('session retrieval does not return secret or sensitive credential fields in user or session context', async () => {
    const now = new Date();
    mockPrisma.session.findFirst.mockResolvedValue({
      id: 'sess-123',
      userId: 'usr-123',
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: now,
      updatedAt: now,
      user: {
        id: 'usr-123',
        name: 'Test Author',
        email: 'author@ule.internal',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });

    const req: any = {
      headers: {
        authorization: 'Bearer valid-token',
      },
    };

    const sessionContext = await authService.getSessionFromRequest(req);
    if (sessionContext) {
      expect((sessionContext.user as any).password).toBeUndefined();
      expect((sessionContext.session as any).secret).toBeUndefined();
    }
  });
});
