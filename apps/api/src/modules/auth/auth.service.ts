import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { toNodeHandler } from 'better-auth/node';
import { bearer, jwt } from 'better-auth/plugins';
import { mcp } from '@better-auth/mcp';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import * as jose from 'jose';
import type { Request, Response } from 'express';
import type { McpProtectedResourceMetadataDto } from '@ule/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionContext } from './auth.types';

function createAuthOptions(
  prisma: PrismaService,
  configService: ConfigService,
) {
  const secret = configService.get<string>('BETTER_AUTH_SECRET');
  if (!secret || secret.length < 32) {
    throw new Error(
      '[AuthService] BETTER_AUTH_SECRET is required and must be at least 32 characters long.',
    );
  }
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

  const mcpResource =
    configService.get<string>('MCP_RESOURCE_URI') ||
    `${baseURL}/${apiPrefix}/mcp`;

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
    plugins: [
      bearer(),
      jwt(),
      mcp({
        loginPage: '/auth/login',
        consentPage: '/auth/consent',
        resource: mcpResource,
        resources: [
          {
            identifier: mcpResource,
            name: 'ULE MCP Authoring',
            allowedScopes: ['course:read', 'course:write'],
          },
        ],
        scopes: ['course:read', 'course:write'],
      }),
      cimd({
        fetchClientMetadataResource,
        metadataProfile: 'mcp-2026-07-28',
      }),
    ],
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

  getMcpResourceUri(): string {
    const port = this.configService.get<number>('PORT', 3000);
    const baseURL =
      this.configService.get<string>('BETTER_AUTH_URL') ||
      `http://localhost:${port}`;
    const apiPrefix = this.configService.get<string>('API_PREFIX', 'api/v1');
    return (
      this.configService.get<string>('MCP_RESOURCE_URI') ||
      `${baseURL}/${apiPrefix}/mcp`
    );
  }

  getMcpIssuer(): string {
    const port = this.configService.get<number>('PORT', 3000);
    const baseURL =
      this.configService.get<string>('BETTER_AUTH_URL') ||
      `http://localhost:${port}`;
    const apiPrefix = this.configService.get<string>('API_PREFIX', 'api/v1');
    return `${baseURL}/${apiPrefix}/auth`;
  }

  getMcpResourceMetadata(): McpProtectedResourceMetadataDto {
    const resource = this.getMcpResourceUri();
    const issuer = this.getMcpIssuer();
    return {
      resource,
      authorization_servers: [issuer],
      scopes_supported: ['course:read', 'course:write'],
      bearer_methods_supported: ['header'],
      resource_documentation: `${resource}/docs`,
    };
  }

  getMcpResourceMetadataUrl(): string {
    const port = this.configService.get<number>('PORT', 3000);
    const baseURL =
      this.configService.get<string>('BETTER_AUTH_URL') ||
      `http://localhost:${port}`;
    return `${baseURL}/.well-known/oauth-protected-resource`;
  }

  /**
   * Authoritatively verifies an MCP access token.
   * Validates EdDSA signature via server JWKS, issuer, audience, expiration,
   * database revocation, and required scopes.
   */
  async verifyMcpToken(
    token: string,
    requiredScope?: string,
  ): Promise<{ userId: string; clientId: string; scopes: string[] }> {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing or invalid bearer token.');
    }

    try {
      const jwks = await this.auth.api.getJwks();
      const localJwks = jose.createLocalJWKSet(jwks);
      const expectedAudience = this.getMcpResourceUri();
      const expectedIssuer = this.getMcpIssuer();

      const { payload } = await jose.jwtVerify(token, localJwks, {
        issuer: expectedIssuer,
        audience: expectedAudience,
      });

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new UnauthorizedException('Token missing subject (sub) claim.');
      }

      // Check database revocation if tracked
      const dbToken = await this.prisma.oauthAccessToken.findFirst({
        where: {
          OR: [
            { token },
            ...(payload.jti ? [{ referenceId: payload.jti }] : []),
          ],
        },
      });

      if (dbToken?.revoked) {
        throw new UnauthorizedException('Token has been revoked.');
      }

      const scopeStr = (payload.scope as string) || '';
      const scopes = scopeStr
        .split(' ')
        .map((s) => s.trim())
        .filter(Boolean);

      if (requiredScope && !scopes.includes(requiredScope)) {
        throw new ForbiddenException(
          `Insufficient scope. Required: '${requiredScope}', granted: '${scopeStr}'.`,
        );
      }

      return {
        userId: payload.sub,
        clientId:
          (payload.azp as string) ||
          (payload.client_id as string) ||
          'unknown_client',
        scopes,
      };
    } catch (err: unknown) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      const e = err as Error;
      throw new UnauthorizedException(
        `MCP access token validation failed: ${e.message}`,
      );
    }
  }
}
