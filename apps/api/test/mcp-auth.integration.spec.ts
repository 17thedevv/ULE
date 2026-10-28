/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import * as crypto from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { createCorsOriginValidator } from '../src/common/utils/cors.util';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';

function extractCookies(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

function parseMcpResponse(res: request.Response): any {
  if (res.body && typeof res.body === 'object' && Object.keys(res.body).length > 0) {
    return res.body;
  }
  const text = res.text || '';
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      try {
        return JSON.parse(trimmed.slice(5).trim());
      } catch {
        // continue
      }
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

describe('Phase 2A: MCP Transport & Authorization Spike (Real PostgreSQL Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const trustedOrigin = 'http://localhost:5173';
  let testUserId: string;
  let testUserEmail: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);

    app.setGlobalPrefix('api/v1', {
      exclude: ['/.well-known/(.*)', '.well-known/(.*)'],
    });
    app.enableCors({
      origin: createCorsOriginValidator(trustedOrigin),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cookie', 'mcp-session-id'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    // Create a real test user in PostgreSQL
    testUserEmail = `mcp_auth_${Date.now()}@ule.internal`;
    const signupRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send({
        email: testUserEmail,
        password: 'Password123!',
        name: 'MCP Author',
      })
      .expect(HttpStatus.OK);

    testUserId = signupRes.body.user.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // Helper to generate signed JWTs using the real Better Auth EdDSA key
  async function generateSignedMcpToken(opts: {
    userId?: string;
    clientId?: string;
    scopes?: string[];
    audience?: string;
    issuer?: string;
    expiresInSeconds?: number;
    tokenId?: string;
  }): Promise<string> {
    const userId = opts.userId || testUserId;
    const clientId = opts.clientId || 'test_external_ai_client';
    const scopes = opts.scopes ?? ['course:read', 'course:write'];
    const aud = opts.audience ?? authService.getMcpResourceUri();
    const iss = opts.issuer ?? authService.getMcpIssuer();
    const now = Math.floor(Date.now() / 1000);
    const exp =
      opts.expiresInSeconds !== undefined
        ? now + opts.expiresInSeconds
        : now + 3600;
    const jti = opts.tokenId || crypto.randomUUID();

    const signed = await (authService.auth.api as any).signJWT({
      body: {
        payload: {
          sub: userId,
          azp: clientId,
          client_id: clientId,
          scope: scopes.join(' '),
          aud,
          iss,
          exp,
          jti,
        },
      },
    });

    return signed.token;
  }

  // =========================================================================
  // 1. RFC 9728 Protected Resource Discovery
  // =========================================================================

  describe('1. RFC 9728 Protected Resource Metadata Discovery', () => {
    it('GET /.well-known/oauth-protected-resource returns RFC 9728 compliant metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/.well-known/oauth-protected-resource')
        .expect(HttpStatus.OK);

      expect(res.body).toMatchObject({
        resource: authService.getMcpResourceUri(),
        authorization_servers: [authService.getMcpIssuer()],
        scopes_supported: expect.arrayContaining(['course:read', 'course:write']),
        bearer_methods_supported: ['header'],
      });
      expect(res.body.resource_documentation).toContain('/docs');
    });

    it('GET /api/v1/mcp/.well-known/oauth-protected-resource returns resource-scoped metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/mcp/.well-known/oauth-protected-resource')
        .expect(HttpStatus.OK);

      expect(res.body).toMatchObject({
        resource: authService.getMcpResourceUri(),
        authorization_servers: [authService.getMcpIssuer()],
        scopes_supported: expect.arrayContaining(['course:read', 'course:write']),
      });
    });
  });

  // =========================================================================
  // 2. Streamable HTTP Protocol & Capability Discovery
  // =========================================================================

  describe('2. MCP Streamable HTTP Initialization & Capability Discovery', () => {
    it('POST /api/v1/mcp processes JSON-RPC initialize and returns server capabilities', async () => {
      const initPayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'ExternalClaudeClient',
            version: '1.0.0',
          },
        },
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .send(initPayload)
        .expect(HttpStatus.OK);

      const parsed = parseMcpResponse(res);
      expect(parsed).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: expect.any(String),
          capabilities: {
            tools: expect.any(Object),
          },
          serverInfo: {
            name: 'ule-mcp-authoring',
            version: '0.1.0',
          },
        },
      });
    });

    it('GET /api/v1/mcp without text/event-stream returns 405 Method Not Allowed with Allow: POST', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/mcp')
        .set('Accept', 'application/json')
        .expect(HttpStatus.METHOD_NOT_ALLOWED);

      expect(res.headers['allow']).toBe('POST');
      expect(res.body.error.message).toContain('GET is only supported for text/event-stream');
    });
  });

  // =========================================================================
  // 3. Anonymous Protection & Fail-Closed Invariants
  // =========================================================================

  describe('3. Anonymous Protection (Fail-Closed)', () => {
    it('anonymous caller cannot call read tool (HTTP 401 with WWW-Authenticate header)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .send({
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: {
            name: 'ule_list_block_types',
            arguments: {},
          },
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.headers['www-authenticate']).toContain('Bearer error="invalid_token"');
      expect(res.headers['www-authenticate']).toContain('resource_metadata=');
      expect(res.body.error.message).toContain('Authentication required');
    });

    it('anonymous caller cannot call mutation tool (HTTP 401 with WWW-Authenticate header)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .send({
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: {
            name: 'ule_create_private_course',
            arguments: {
              title: 'Anonymous Hack Attempt',
            },
          },
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.headers['www-authenticate']).toContain('Bearer error="invalid_token"');
    });
  });

  // =========================================================================
  // 4. Token Integrity, Expiration, Revocation, and Audience Checks
  // =========================================================================

  describe('4. Token Security & Cryptographic Integrity', () => {
    it('rejects malformed / forged bearer token string with HTTP 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', 'Bearer forged.tampered.signature')
        .send({
          jsonrpc: '2.0',
          id: 20,
          method: 'tools/call',
          params: { name: 'ule_list_block_types', arguments: {} },
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.headers['www-authenticate']).toContain('invalid_token');
    });

    it('rejects wrong-audience token with HTTP 401', async () => {
      const wrongAudienceToken = await generateSignedMcpToken({
        audience: 'https://attacker-controlled-service.com/mcp',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${wrongAudienceToken}`)
        .send({
          jsonrpc: '2.0',
          id: 21,
          method: 'tools/call',
          params: { name: 'ule_list_block_types', arguments: {} },
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.headers['www-authenticate']).toContain('invalid_token');
      expect(res.body.error.message).toContain('aud');
    });

    it('rejects expired token with HTTP 401', async () => {
      const expiredToken = await generateSignedMcpToken({
        expiresInSeconds: -300, // expired 5 minutes ago
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          jsonrpc: '2.0',
          id: 22,
          method: 'tools/call',
          params: { name: 'ule_list_block_types', arguments: {} },
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.headers['www-authenticate']).toContain('invalid_token');
      expect(res.body.error.message).toContain('exp');
    });

    it('rejects revoked token recorded in database with HTTP 401', async () => {
      const tokenId = crypto.randomUUID();
      const revokedToken = await generateSignedMcpToken({ tokenId });

      // Ensure test client exists in PostgreSQL to satisfy FK
      await prisma.oauthClient.upsert({
        where: { clientId: 'test_client' },
        update: {},
        create: {
          clientId: 'test_client',
          clientSecret: 'secret_123',
          name: 'Revocation Test Client',
          redirectUris: ['http://localhost:5173/callback'],
        },
      });

      // Record token as revoked in PostgreSQL
      await prisma.oauthAccessToken.create({
        data: {
          token: revokedToken,
          referenceId: tokenId,
          clientId: 'test_client',
          userId: testUserId,
          scopes: ['course:read', 'course:write'],
          expiresAt: new Date(Date.now() + 3600000),
          revoked: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${revokedToken}`)
        .send({
          jsonrpc: '2.0',
          id: 23,
          method: 'tools/call',
          params: { name: 'ule_list_block_types', arguments: {} },
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.headers['www-authenticate']).toContain('invalid_token');
      expect(res.body.error.message).toContain('revoked');
    });
  });

  // =========================================================================
  // 5. Scope-Based Permission Enforcement (course:read vs course:write)
  // =========================================================================

  describe('5. Fine-Grained Scope Authorization', () => {
    let readOnlyToken: string;
    let writeToken: string;

    beforeAll(async () => {
      readOnlyToken = await generateSignedMcpToken({
        scopes: ['course:read'],
      });
      writeToken = await generateSignedMcpToken({
        scopes: ['course:read', 'course:write'],
      });
    });

    it('authorized client with course:read can invoke ule_get_authoring_capabilities', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: 30,
          method: 'tools/call',
          params: {
            name: 'ule_get_authoring_capabilities',
            arguments: {},
          },
        })
        .expect(HttpStatus.OK);

      const parsed = parseMcpResponse(res);
      expect(parsed.result.isError).toBeFalsy();
      const capabilities = JSON.parse(parsed.result.content[0].text);
      expect(capabilities).toMatchObject({
        version: '1.0.0',
        enforcesOwnership: true,
        visibilityDefault: 'PRIVATE',
        supportedBlockTypes: expect.arrayContaining(['video', 'multiple-choice', 'coding']),
        prohibitedOperations: expect.arrayContaining([
          'submit_learner_attempt',
          'alter_mastery',
          'grant_xp_or_rewards',
          'publish_course_publicly',
        ]),
      });
    });

    it('authorized client with course:read can invoke ule_list_block_types', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: 31,
          method: 'tools/call',
          params: {
            name: 'ule_list_block_types',
            arguments: {},
          },
        })
        .expect(HttpStatus.OK);

      const parsed = parseMcpResponse(res);
      expect(parsed.result.isError).toBeFalsy();
      const types = JSON.parse(parsed.result.content[0].text);
      expect(types.length).toBeGreaterThanOrEqual(3);
      expect(types.map((t: any) => t.blockTypeId)).toEqual(
        expect.arrayContaining(['video', 'multiple-choice', 'coding']),
      );
    });

    it('read-only token CANNOT invoke write tool ule_create_private_course (Scope Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: 32,
          method: 'tools/call',
          params: {
            name: 'ule_create_private_course',
            arguments: {
              title: 'Attempt with Read Token',
            },
          },
        })
        .expect(HttpStatus.OK);

      const parsed = parseMcpResponse(res);
      expect(parsed.result.isError).toBe(true);
      expect(parsed.result.content[0].text).toContain('[Forbidden] Insufficient scope');
      expect(parsed.result.content[0].text).toContain("Tool 'ule_create_private_course' requires scope 'course:write'");
    });

    it('authorized client with course:write can invoke ule_create_private_course', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${writeToken}`)
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: 33,
          method: 'tools/call',
          params: {
            name: 'ule_create_private_course',
            arguments: {
              title: 'Authorized MCP Course',
              description: 'Created by external AI via MCP',
              idempotencyKey: crypto.randomUUID(),
            },
          },
        })
        .expect(HttpStatus.OK);

      const parsed = parseMcpResponse(res);
      expect(parsed.result.isError).toBeFalsy();
      const course = JSON.parse(parsed.result.content[0].text);
      expect(course).toMatchObject({
        course: {
          id: expect.any(String),
          visibility: 'PRIVATE',
          ownerId: testUserId,
        },
        draft: {
          title: 'Authorized MCP Course',
          revision: 1,
        },
      });

      // Confirm in PostgreSQL
      const dbCourse = await prisma.course.findUnique({
        where: { id: course.course.id },
      });
      expect(dbCourse).not.toBeNull();
      expect(dbCourse!.ownerId).toBe(testUserId);
      expect(dbCourse!.visibility).toBe('PRIVATE');
    });
  });

  // =========================================================================
  // 6. Host & Origin Security Guarantees
  // =========================================================================

  describe('6. Host and Origin Validation Guarantees', () => {
    it('rejects untrusted Host header with HTTP 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Host', 'malicious-attacker-dns.org:3000')
        .send({
          jsonrpc: '2.0',
          id: 40,
          method: 'initialize',
          params: { protocolVersion: '2024-11-05' },
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.error.message).toContain('Invalid or untrusted Host header');
    });

    it('rejects untrusted Origin header with HTTP 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Origin', 'http://malicious-website.com')
        .send({
          jsonrpc: '2.0',
          id: 41,
          method: 'initialize',
          params: { protocolVersion: '2024-11-05' },
        })
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.message).toContain('Origin');
    });
  });

  // =========================================================================
  // 7. Non-Regression: Existing Browser Session Authentication
  // =========================================================================

  describe('7. Web Session Regression Check', () => {
    it('browser session sign-in and course access remain functional alongside MCP', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/email')
        .set('Origin', trustedOrigin)
        .send({
          email: testUserEmail,
          password: 'Password123!',
        })
        .expect(HttpStatus.OK);

      const sessionCookie = extractCookies(loginRes);
      expect(sessionCookie).toContain('better-auth');

      // Access authoritative REST endpoint using session cookie
      const coursesRes = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .set('Cookie', sessionCookie)
        .set('Origin', trustedOrigin)
        .expect(HttpStatus.OK);

      expect(Array.isArray(coursesRes.body)).toBe(true);
      expect(coursesRes.body.length).toBeGreaterThanOrEqual(1);
      expect(coursesRes.body[0].ownerId).toBe(testUserId);
    });
  });
});
