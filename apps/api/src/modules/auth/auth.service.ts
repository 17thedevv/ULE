import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { toNodeHandler } from 'better-auth/node';
import { bearer } from 'better-auth/plugins';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionContext } from './auth.types';

function createAuthOptions(
  prisma: PrismaService,
  configService: ConfigService,
) {
  const secret =
    configService.get<string>('BETTER_AUTH_SECRET') ||
    'development-secret-for-ule-phase-1a-32-chars-long';
  const port = configService.get<number>('PORT', 3000);
  const baseURL =
    configService.get<string>('BETTER_AUTH_URL') ||
    `http://localhost:${port}`;
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const corsOrigin = configService.get<string>(
    'CORS_ORIGIN',
    'http://localhost:5173',
  );
  const trustedOrigins = corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== '*');

  return {
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    secret,
    baseURL,
    basePath: `/${apiPrefix}/auth`,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [bearer()],
  };
}

export type UleAuthOptions = ReturnType<typeof createAuthOptions>;
export type UleAuth = ReturnType<typeof betterAuth<UleAuthOptions>>;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  public auth!: UleAuth;
  private nodeHandler!: (req: Request, res: Response) => Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const options = createAuthOptions(this.prisma, this.configService);
    this.auth = betterAuth(options);
    this.nodeHandler = toNodeHandler(this.auth);
    this.logger.log(
      `Better Auth initialized with basePath ${options.basePath}`,
    );
  }

  async handleAuthRequest(req: Request, res: Response): Promise<void> {
    return this.nodeHandler(req, res);
  }

  async getSessionFromRequest(req: Request): Promise<AuthSessionContext | null> {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v));
          } else {
            headers.set(key, value);
          }
        }
      }

      const session = await this.auth.api.getSession({
        headers,
      });

      if (!session || !session.user || !session.session) {
        return null;
      }

      return {
        user: session.user as unknown as AuthSessionContext['user'],
        session: session.session as unknown as AuthSessionContext['session'],
      };
    } catch (error) {
      this.logger.warn(`Failed to resolve session from request: ${error}`);
      return null;
    }
  }
}
