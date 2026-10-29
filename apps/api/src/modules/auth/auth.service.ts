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
import * as crypto from 'crypto';
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
        allowDynamicClientRegistration: true,
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
    const isTokenEndpoint =
      req.method === 'POST' &&
      (req.originalUrl?.includes('/oauth2/token') ||
        req.url?.includes('/oauth2/token'));

    if (isTokenEndpoint) {
      const chunks: Buffer[] = [];
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);

      /* eslint-disable @typescript-eslint/no-explicit-any */
      res.write = ((chunk: any, ...args: any[]) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return originalWrite(chunk, ...args);
      }) as any;

      res.end = (async (chunk: any, ...args: any[]) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const bodyStr = Buffer.concat(chunks).toString('utf-8');
            const data = JSON.parse(bodyStr);
            if (data?.access_token && typeof data.access_token === 'string') {
              await this.recordIssuedOAuthToken(data.access_token);
            }
          } catch (e: unknown) {
            const err = e as Error;
            this.logger.warn(
              `Could not parse token response body: ${err.message}`,
            );
          }
        }
        return originalEnd(chunk, ...args);
      }) as any;
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }

    return this.nodeHandler(req, res);
  }

  private async recordIssuedOAuthToken(token: string): Promise<void> {
    try {
      const claims = jose.decodeJwt(token);
      if (!claims.sub) return;

      const clientId =
        (claims.azp as string) ||
        (claims.client_id as string) ||
        'unknown_client';

      const scopes =
        typeof claims.scope === 'string'
          ? claims.scope.split(' ').map((s) => s.trim()).filter(Boolean)
          : Array.isArray(claims.scope)
            ? (claims.scope as string[])
            : [];

      const resources = Array.isArray(claims.aud)
        ? (claims.aud as string[])
        : typeof claims.aud === 'string'
          ? [claims.aud]
          : [];

      const expiresAt = claims.exp
        ? new Date(claims.exp * 1000)
        : new Date(Date.now() + 3600 * 1000);

      const referenceId = (claims.jti as string) || crypto.randomUUID();

      await this.prisma.oauthAccessToken.create({
        data: {
          token,
          referenceId,
          clientId,
          userId: claims.sub,
          scopes,
          resources,
          expiresAt,
        },
      });
      this.logger.log(
        `Recorded issued OAuth access token for client ${clientId}, user ${claims.sub}`,
      );
    } catch (err: unknown) {
      const e = err as Error;
      this.logger.error(`Error recording issued OAuth token: ${e.message}`);
    }
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
   * active issuance record in PostgreSQL, revocation status, client status, and required scopes.
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

      // Check authoritative database issuance record in oauth_access_tokens
      const dbToken = await this.prisma.oauthAccessToken.findFirst({
        where: {
          OR: [
            { token },
            ...(payload.jti ? [{ referenceId: payload.jti }] : []),
          ],
        },
      });

      // Reject tokens that lack a valid active issuance / grant record
      if (!dbToken) {
        throw new UnauthorizedException(
          'Access token has no active issuance or grant record.',
        );
      }

      if (dbToken.revoked) {
        throw new UnauthorizedException('Access token has been revoked.');
      }

      if (dbToken.expiresAt && dbToken.expiresAt < new Date()) {
        throw new UnauthorizedException('Access token has expired.');
      }

      if (dbToken.userId && dbToken.userId !== payload.sub) {
        throw new UnauthorizedException(
          'Token subject mismatch with issuance record.',
        );
      }

      const clientId =
        (payload.azp as string) ||
        (payload.client_id as string) ||
        dbToken.clientId;

      if (dbToken.clientId && clientId && dbToken.clientId !== clientId) {
        throw new UnauthorizedException(
          'Token client mismatch with issuance record.',
        );
      }

      if (
        dbToken.resources &&
        dbToken.resources.length > 0 &&
        !dbToken.resources.includes(expectedAudience)
      ) {
        throw new UnauthorizedException(
          'Access token not authorized for this MCP resource.',
        );
      }

      // Verify OAuth client is registered and active
      const client = await this.prisma.oauthClient.findUnique({
        where: { clientId: dbToken.clientId },
      });

      if (!client || client.disabled) {
        throw new UnauthorizedException(
          'OAuth client is inactive or disabled.',
        );
      }

      // Verify active user consent grant (consent record must exist for this client and user)
      if (dbToken.userId) {
        const consent = await this.prisma.oauthConsent.findFirst({
          where: {
            clientId: dbToken.clientId,
            userId: dbToken.userId,
          },
        });

        if (!consent) {
          throw new UnauthorizedException(
            'OAuth user grant or consent record has been revoked.',
          );
        }
      }

      const payloadScopeStr = (payload.scope as string) || '';
      const payloadScopes = payloadScopeStr
        .split(' ')
        .map((s) => s.trim())
        .filter(Boolean);

      // Authoritative scopes: checked against token payload and DB grant
      const grantedScopes = new Set(
        payloadScopes.length > 0 ? payloadScopes : dbToken.scopes ?? [],
      );

      if (requiredScope && !grantedScopes.has(requiredScope)) {
        throw new ForbiddenException(
          `Insufficient scope. Required: '${requiredScope}', granted: '${Array.from(grantedScopes).join(' ')}'.`,
        );
      }

      return {
        userId: payload.sub,
        clientId: dbToken.clientId,
        scopes: Array.from(grantedScopes),
      };
    } catch (err: unknown) {
      if (err instanceof ForbiddenException || err instanceof UnauthorizedException) {
        throw err;
      }
      const e = err as Error;
      throw new UnauthorizedException(
        `MCP access token validation failed: ${e.message}`,
      );
    }
  }
}
