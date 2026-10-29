import { JSDOM } from 'jsdom';
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

function combineCookies(...cookieStrings: string[]): string {
  const map = new Map<string, string>();
  for (const str of cookieStrings) {
    if (!str) continue;
    for (const part of str.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        map.set(key, trimmed);
      }
    }
  }
  return Array.from(map.values()).join('; ');
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

describe('Phase 2: MCP Transport, Real OAuth 2.1 & Security Gates (Real PostgreSQL)', () => {
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
      exclude: [
        '/.well-known/(.*)',
        '.well-known/(.*)',
        'auth/login',
        '/auth/login',
        'auth/consent',
        '/auth/consent',
      ],
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

  // Helper to generate database-backed authorized tokens for specific test cases
  async function createDatabaseBackedToken(opts: {
    userId?: string;
    clientId?: string;
    scopes?: string[];
    audience?: string;
    expiresInSeconds?: number;
    skipDatabaseInsert?: boolean;
    revoked?: boolean;
  }): Promise<string> {
    const userId = opts.userId || testUserId;
    const clientId = opts.clientId || 'test_oauth_client';
    const scopes = opts.scopes ?? ['course:read', 'course:write'];
    const aud = opts.audience ?? authService.getMcpResourceUri();
    const iss = authService.getMcpIssuer();
    const now = Math.floor(Date.now() / 1000);
    const exp =
      opts.expiresInSeconds !== undefined
        ? now + opts.expiresInSeconds
        : now + 3600;
    const jti = crypto.randomUUID();

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

    if (!opts.skipDatabaseInsert) {
      // Ensure client exists
      await prisma.oauthClient.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          clientSecret: 'secret_123',
          name: 'Test OAuth Client',
          redirectUris: ['http://localhost:5173/oauth/callback'],
          scopes,
        },
      });

      // Ensure consent grant exists
      const existingConsent = await prisma.oauthConsent.findFirst({
        where: { clientId, userId },
      });
      if (!existingConsent) {
        await prisma.oauthConsent.create({
          data: {
            clientId,
            userId,
            scopes,
            resources: [aud],
          },
        });
      }

      // Insert active issuance record
      await prisma.oauthAccessToken.create({
        data: {
          token: signed.token,
          referenceId: jti,
          clientId,
          userId,
          scopes,
          resources: [aud],
          expiresAt: new Date(exp * 1000),
          revoked: opts.revoked ? new Date() : null,
        },
      });
    }

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
  // 3. GATE 1: Real OAuth 2.1 Authorization Code Flow with PKCE & Consent
  // =========================================================================

  describe('Gate 1 — Real OAuth 2.1 Flow, Consent, and Token Authority', () => {
    const oauthClientId = `client_external_${Date.now()}`;
    const validRedirectUri = 'http://localhost:5173/oauth/callback';
    let codeVerifier: string;
    let codeChallenge: string;
    let userSessionCookie: string;
    let authorizeCookies: string;
    let consentLocationQuery: string;
    let issuedAccessToken: string;

    beforeAll(async () => {
      const mcpResourceUri = authService.getMcpResourceUri();

      // Ensure the resource exists in oauth_resources
      await prisma.oauthResource.upsert({
        where: { identifier: mcpResourceUri },
        update: {},
        create: {
          identifier: mcpResourceUri,
          name: 'ULE MCP Authoring',
          allowedScopes: ['course:read', 'course:write'],
        },
      });

      // 1. Register a legitimate external public OAuth client (PKCE, tokenEndpointAuthMethod: 'none')
      await prisma.oauthClient.create({
        data: {
          clientId: oauthClientId,
          name: 'Claude Desktop Agent',
          redirectUris: [validRedirectUri],
          scopes: ['course:read', 'course:write'],
          requirePKCE: true,
          tokenEndpointAuthMethod: 'none',
          grantTypes: ['authorization_code', 'refresh_token'],
          responseTypes: ['code'],
        },
      });

      // Link client to MCP resource
      await prisma.oauthClientResource.create({
        data: {
          clientId: oauthClientId,
          resourceId: mcpResourceUri,
        },
      });

      // 2. PKCE setup: code_verifier and code_challenge (S256)
      codeVerifier = crypto.randomBytes(32).toString('base64url');
      codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
    });

    it('Step 1: Reject authorization request with unregistered / invalid redirect_uri', async () => {
      const invalidRedirectUri = 'http://malicious-site.com/steal-code';
      const res = await request(app.getHttpServer()).get(
        `/api/v1/auth/oauth2/authorize?response_type=code&client_id=${oauthClientId}&redirect_uri=${encodeURIComponent(
          invalidRedirectUri,
        )}&scope=course:read&code_challenge=${codeChallenge}&code_challenge_method=S256`,
      );

      // Must NEVER redirect to the attacker's invalid redirect_uri
      if (res.headers['location']) {
        expect(res.headers['location']).not.toContain('malicious-site.com');
      }
    });

    it('Step 2: Unauthenticated authorize request redirects to functional /auth/login page', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/auth/oauth2/authorize?response_type=code&client_id=${oauthClientId}&redirect_uri=${encodeURIComponent(
            validRedirectUri,
          )}&scope=course:read%20course:write&code_challenge=${codeChallenge}&code_challenge_method=S256&resource=${encodeURIComponent(
            authService.getMcpResourceUri(),
          )}`,
        )
        .expect(HttpStatus.FOUND);

      expect(res.headers['location']).toContain('/auth/login');

      // Verify actual HTTP route /auth/login is functional
      const loginPageRes = await request(app.getHttpServer())
        .get('/auth/login')
        .expect(HttpStatus.OK);

      expect(loginPageRes.headers['content-type']).toContain('text/html');
      expect(loginPageRes.text).toContain('Sign In to ULE');
    });

    it('Step 3: Authenticate real ULE user account and verify session', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/email')
        .set('Origin', trustedOrigin)
        .send({
          email: testUserEmail,
          password: 'Password123!',
        })
        .expect(HttpStatus.OK);

      userSessionCookie = extractCookies(loginRes);
      expect(userSessionCookie).toContain('better-auth');
    });

    it('Step 4: Authenticated user without consent is redirected to functional /auth/consent page', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/auth/oauth2/authorize?response_type=code&client_id=${oauthClientId}&redirect_uri=${encodeURIComponent(
            validRedirectUri,
          )}&scope=course:read%20course:write&code_challenge=${codeChallenge}&code_challenge_method=S256&resource=${encodeURIComponent(
            authService.getMcpResourceUri(),
          )}`,
        )
        .set('Cookie', userSessionCookie)
        .expect(HttpStatus.FOUND);

      expect(res.headers['location']).toContain('/auth/consent');
      const loc = res.headers['location'];
      const qIdx = loc.indexOf('?');
      consentLocationQuery = qIdx >= 0 ? loc.slice(qIdx + 1) : '';
      authorizeCookies = extractCookies(res);

      // Verify actual HTTP route /auth/consent is functional
      const consentPageRes = await request(app.getHttpServer())
        .get('/auth/consent')
        .expect(HttpStatus.OK);

      expect(consentPageRes.headers['content-type']).toContain('text/html');
      expect(consentPageRes.text).toContain('Authorize Application');
      expect(consentPageRes.text).toContain('course:read');
      expect(consentPageRes.text).toContain('course:write');
    });

    it('Step 5: Record user consent and receive authorization code', async () => {
      const combinedCookie = combineCookies(userSessionCookie, authorizeCookies);

      // Record consent in Better Auth
      const consentRes = await request(app.getHttpServer())
        .post('/api/v1/auth/oauth2/consent')
        .set('Cookie', combinedCookie)
        .set('Origin', trustedOrigin)
        .send({
          accept: true,
          scope: 'course:read course:write',
          oauth_query: consentLocationQuery,
        })
        .expect(HttpStatus.OK);

      expect(consentRes.body.redirect).toBe(true);
      expect(consentRes.body.url).toContain(validRedirectUri);
      expect(consentRes.body.url).toContain('code=');

      // Confirm consent row in PostgreSQL
      const dbConsent = await prisma.oauthConsent.findFirst({
        where: {
          clientId: oauthClientId,
          userId: testUserId,
        },
      });
      expect(dbConsent).not.toBeNull();
      expect(dbConsent!.scopes).toEqual(
        expect.arrayContaining(['course:read', 'course:write']),
      );

      // Extract code
      const url = new URL(consentRes.body.url);
      const authCode = url.searchParams.get('code')!;
      expect(authCode).toBeTruthy();

      // Step 6: Exchange authorization code for MCP resource-bound access token
      const tokenRes = await request(app.getHttpServer())
        .post('/api/v1/auth/oauth2/token')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(
          new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            code_verifier: codeVerifier,
            client_id: oauthClientId,
            redirect_uri: validRedirectUri,
            resource: authService.getMcpResourceUri(),
          }).toString(),
        );

      if (tokenRes.status !== HttpStatus.OK) {
        throw new Error(
          `Token exchange failed with status ${tokenRes.status}: ${JSON.stringify(tokenRes.body || tokenRes.text)}`,
        );
      }

      expect(tokenRes.body).toMatchObject({
        access_token: expect.any(String),
        token_type: 'Bearer',
        expires_in: expect.any(Number),
      });

      issuedAccessToken = tokenRes.body.access_token;

      // Verify active issuance record in PostgreSQL
      const dbAccessToken = await prisma.oauthAccessToken.findFirst({
        where: {
          clientId: oauthClientId,
          userId: testUserId,
          revoked: null,
        },
      });
      expect(dbAccessToken).not.toBeNull();
    });

    it('Step 7: Invoke tools/list and permitted tool using real OAuth issued token', async () => {
      // 1. tools/list
      const listToolsRes = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${issuedAccessToken}`)
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: 50,
          method: 'tools/list',
          params: {},
        })
        .expect(HttpStatus.OK);

      const parsedTools = parseMcpResponse(listToolsRes);
      expect(parsedTools.result.tools).toBeDefined();
      expect(parsedTools.result.tools.length).toBe(17);

      // 2. Invoke permitted tool
      const callToolRes = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${issuedAccessToken}`)
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: 51,
          method: 'tools/call',
          params: {
            name: 'ule_list_block_types',
            arguments: {},
          },
        })
        .expect(HttpStatus.OK);

      const parsedCall = parseMcpResponse(callToolRes);
      expect(parsedCall.result.isError).toBeFalsy();
    });

    it('Step 8: Revoking token immediately fails subsequent MCP tool calls (HTTP 401)', async () => {
      // Revoke token via database
      await prisma.oauthAccessToken.updateMany({
        where: { clientId: oauthClientId, userId: testUserId },
        data: { revoked: new Date() },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${issuedAccessToken}`)
        .send({
          jsonrpc: '2.0',
          id: 52,
          method: 'tools/call',
          params: { name: 'ule_list_block_types', arguments: {} },
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.error.message).toContain('revoked');
    });

    it('Step 8b: Revoking user consent grant immediately fails subsequent MCP tool calls (HTTP 401)', async () => {
      // Unrevoke token in oauthAccessToken
      await prisma.oauthAccessToken.updateMany({
        where: { clientId: oauthClientId, userId: testUserId },
        data: { revoked: null },
      });

      // Revoke user consent grant
      await prisma.oauthConsent.deleteMany({
        where: { clientId: oauthClientId, userId: testUserId },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${issuedAccessToken}`)
        .send({
          jsonrpc: '2.0',
          id: 522,
          method: 'tools/call',
          params: { name: 'ule_list_block_types', arguments: {} },
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.error.message).toContain('revoked');
    });

    it('Step 9 (Regression): Correctly signed JWT without active issuance record is strictly REJECTED (HTTP 401)', async () => {
      // Create a validly signed token with the server's EdDSA key but DO NOT insert it into oauth_access_tokens
      const unrecordedToken = await createDatabaseBackedToken({
        skipDatabaseInsert: true,
        scopes: ['course:read', 'course:write'],
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${unrecordedToken}`)
        .send({
          jsonrpc: '2.0',
          id: 53,
          method: 'tools/call',
          params: {
            name: 'ule_create_private_course',
            arguments: {
              title: 'Should Be Rejected Course',
              idempotencyKey: crypto.randomUUID(),
            },
          },
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.error.message).toContain('no active issuance or grant record');
    });
  });

  // =========================================================================
  // 4. Token Integrity, Expiration, and Scope Checks
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
      const wrongAudienceToken = await createDatabaseBackedToken({
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
      const expiredToken = await createDatabaseBackedToken({
        expiresInSeconds: -300,
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
  });

  // =========================================================================
  // 5. Fine-Grained Scope Authorization
  // =========================================================================

  describe('5. Fine-Grained Scope Authorization', () => {
    let readOnlyToken: string;
    let writeToken: string;

    beforeAll(async () => {
      readOnlyToken = await createDatabaseBackedToken({
        scopes: ['course:read'],
      });
      writeToken = await createDatabaseBackedToken({
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
              idempotencyKey: crypto.randomUUID(),
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
  // GATE B: Browser OAuth Consent Correctness & Browser DOM Smoke Test
  // =========================================================================

  describe('Gate B — Browser OAuth Consent Correctness & Automation', () => {
    const browserClientId = `client_browser_${Date.now()}`;
    const browserRedirectUri = 'http://localhost:5173/browser/callback';
    let browserVerifier: string;
    let browserChallenge: string;
    let userSessionCookie: string;
    let readOnlyAuthorizeCookies: string;
    let readOnlyConsentQuery: string;

    beforeAll(async () => {
      const mcpResourceUri = authService.getMcpResourceUri();

      // Register public OAuth client
      await prisma.oauthClient.create({
        data: {
          clientId: browserClientId,
          name: 'Cursor Desktop Automation',
          redirectUris: [browserRedirectUri],
          scopes: ['course:read', 'course:write'],
          requirePKCE: true,
          tokenEndpointAuthMethod: 'none',
          grantTypes: ['authorization_code'],
          responseTypes: ['code'],
        },
      });

      await prisma.oauthClientResource.create({
        data: {
          clientId: browserClientId,
          resourceId: mcpResourceUri,
        },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/email')
        .set('Origin', trustedOrigin)
        .send({
          email: testUserEmail,
          password: 'Password123!',
        })
        .expect(HttpStatus.OK);
      userSessionCookie = extractCookies(loginRes);

      browserVerifier = crypto.randomBytes(32).toString('base64url');
      browserChallenge = crypto
        .createHash('sha256')
        .update(browserVerifier)
        .digest('base64url');
    });

    it('preserves request context and displays actual requested client and scopes (read-only)', async () => {
      // 1. User requests authorization with course:read ONLY
      const authRes = await request(app.getHttpServer())
        .get(
          `/api/v1/auth/oauth2/authorize?response_type=code&client_id=${browserClientId}&redirect_uri=${encodeURIComponent(
            browserRedirectUri,
          )}&scope=course:read&code_challenge=${browserChallenge}&code_challenge_method=S256&resource=${encodeURIComponent(
            authService.getMcpResourceUri(),
          )}`,
        )
        .set('Cookie', userSessionCookie)
        .expect(HttpStatus.FOUND);

      expect(authRes.headers['location']).toContain('/auth/consent');
      const loc = authRes.headers['location'];
      const qIdx = loc.indexOf('?');
      readOnlyConsentQuery = qIdx >= 0 ? loc.slice(qIdx + 1) : '';
      readOnlyAuthorizeCookies = extractCookies(authRes);

      // 2. Fetch rendered HTML from GET /auth/consent
      const htmlRes = await request(app.getHttpServer())
        .get(`/auth/consent?${readOnlyConsentQuery}`)
        .expect(HttpStatus.OK);

      // 3. Load into JSDOM with script execution enabled
      const dom = new JSDOM(htmlRes.text, {
        url: `http://localhost:3000/auth/consent?${readOnlyConsentQuery}`,
        runScripts: 'dangerously',
      });

      // Verify DOM reflects requesting client and only requested scope
      const clientNameEl = dom.window.document.getElementById('clientName');
      expect(clientNameEl?.textContent).toBe(browserClientId);

      // Verify course:read badge exists
      const readBadge = dom.window.document.getElementById('badge-course:read');
      expect(readBadge).not.toBeNull();
      expect(readBadge?.textContent).toBe('course:read');

      // Verify course:write badge is strictly absent (never elevated silently)
      const writeBadge = dom.window.document.getElementById('badge-course:write');
      expect(writeBadge).toBeNull();
    });

    it('verifies consent denial via real button action redirects with access_denied', async () => {
      const combinedCookie = combineCookies(userSessionCookie, readOnlyAuthorizeCookies);

      const htmlRes = await request(app.getHttpServer())
        .get(`/auth/consent?${readOnlyConsentQuery}`)
        .expect(HttpStatus.OK);

      const dom = new JSDOM(htmlRes.text, {
        url: `http://localhost:3000/auth/consent?${readOnlyConsentQuery}`,
        runScripts: 'dangerously',
      });

      let navigatedUrl: string | null = null;
      dom.window.fetch = (async (url: string, opts: any) => {
        const req = request(app.getHttpServer()).post(url);
        req.set('Cookie', combinedCookie);
        req.set('Origin', trustedOrigin);
        if (opts.headers) {
          for (const [k, v] of Object.entries(opts.headers)) {
            req.set(k, v as string);
          }
        }
        const res = await req.send(opts.body ? JSON.parse(opts.body) : {});
        if (res.body?.url) {
          navigatedUrl = res.body.url;
        }
        return {
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          json: async () => res.body,
        };
      }) as any;

      // Click the Deny button in real DOM
      const denyBtn = dom.window.document.getElementById('denyBtn') as any;
      expect(denyBtn).not.toBeNull();
      denyBtn.click();

      // Wait briefly for async fetch
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(navigatedUrl).toBeTruthy();
      expect(navigatedUrl).toContain('error=access_denied');
      expect(navigatedUrl).toContain(browserRedirectUri);

      // Confirm no consent recorded for read-only
      const consent = await prisma.oauthConsent.findFirst({
        where: { clientId: browserClientId, userId: testUserId },
      });
      expect(consent).toBeNull();
    });

    it('verifies consent acceptance via real button action produces read-only token unable to write', async () => {
      const combinedCookie = combineCookies(userSessionCookie, readOnlyAuthorizeCookies);

      const htmlRes = await request(app.getHttpServer())
        .get(`/auth/consent?${readOnlyConsentQuery}`)
        .expect(HttpStatus.OK);

      const dom = new JSDOM(htmlRes.text, {
        url: `http://localhost:3000/auth/consent?${readOnlyConsentQuery}`,
        runScripts: 'dangerously',
      });

      let navigatedUrl: string | null = null;
      dom.window.fetch = (async (url: string, opts: any) => {
        const req = request(app.getHttpServer()).post(url);
        req.set('Cookie', combinedCookie);
        req.set('Origin', trustedOrigin);
        if (opts.headers) {
          for (const [k, v] of Object.entries(opts.headers)) {
            req.set(k, v as string);
          }
        }
        const res = await req.send(opts.body ? JSON.parse(opts.body) : {});
        if (res.body?.url) {
          navigatedUrl = res.body.url;
        }
        return {
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          json: async () => res.body,
        };
      }) as any;

      // Click the Authorize button in real DOM
      const allowBtn = dom.window.document.getElementById('allowBtn') as any;
      expect(allowBtn).not.toBeNull();
      allowBtn.click();

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(navigatedUrl).toBeTruthy();
      expect(navigatedUrl).toContain('code=');

      // Exchange authorization code for token
      const codeUrl = new URL(navigatedUrl!);
      const authCode = codeUrl.searchParams.get('code')!;
      expect(authCode).toBeTruthy();

      const tokenRes = await request(app.getHttpServer())
        .post('/api/v1/auth/oauth2/token')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(
          new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            code_verifier: browserVerifier,
            client_id: browserClientId,
            redirect_uri: browserRedirectUri,
            resource: authService.getMcpResourceUri(),
          }).toString(),
        )
        .expect(HttpStatus.OK);

      const token = tokenRes.body.access_token;
      expect(token).toBeTruthy();

      // Verify token scopes in PostgreSQL
      const dbToken = await prisma.oauthAccessToken.findFirst({
        where: { token },
      });
      expect(dbToken).not.toBeNull();
      expect(dbToken!.scopes).toEqual(['course:read']);

      // Verify read-only call succeeds
      const listRes = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send({
          jsonrpc: '2.0',
          id: 101,
          method: 'tools/call',
          params: {
            name: 'ule_list_block_types',
            arguments: {},
          },
        })
        .expect(HttpStatus.OK);

      const parsedList = parseMcpResponse(listRes);
      expect(parsedList.result.isError).toBeFalsy();

      // Verify write call FAILS with 403 Forbidden
      const writeRes = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send({
          jsonrpc: '2.0',
          id: 102,
          method: 'tools/call',
          params: {
            name: 'ule_create_private_course',
            arguments: {
              title: 'Attempted Write With Read Token',
              idempotencyKey: crypto.randomUUID(),
            },
          },
        })
        .expect(HttpStatus.OK);

      const parsedWrite = parseMcpResponse(writeRes);
      expect(parsedWrite.result.isError).toBe(true);
      expect(parsedWrite.result.content[0].text).toContain('Forbidden');
      expect(parsedWrite.result.content[0].text).toContain('Insufficient scope');
    });
  });

});
