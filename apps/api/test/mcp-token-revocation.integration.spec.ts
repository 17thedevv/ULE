import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

interface OAuthClientFixture {
  client_id: string;
  client_secret?: string;
}

describe('P7-05: MCP JWT revocation client binding (real PostgreSQL)', () => {
  let app: INestApplication;
  let auth: AuthService;
  let prisma: PrismaService;
  let userId: string;
  let browserCookie: string;
  let publicClient: OAuthClientFixture;
  let otherClient: OAuthClientFixture;
  let basicClient: OAuthClientFixture;
  let postClient: OAuthClientFixture;
  const endpoint = '/api/v1/auth/oauth2/revoke';

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    auth = app.get(AuthService);
    prisma = app.get(PrismaService);
    const signup = await request(app.getHttpServer()).post('/api/v1/auth/sign-up/email')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'MCP revoke fixture', email: `revoke-${randomUUID()}@ule.internal`, password: 'Password123!' })
      .expect(200);
    userId = signup.body.user.id;
    const cookies = signup.headers['set-cookie'] as unknown as string[];
    browserCookie = cookies.map((value) => value.split(';')[0]).join('; ');
    publicClient = await register('none');
    otherClient = await register('none');
    basicClient = await register('client_secret_basic');
    postClient = await register('client_secret_post');
  });

  afterAll(async () => { await app?.close(); });

  async function register(method: string): Promise<OAuthClientFixture> {
    const registered = await request(app.getHttpServer()).post('/api/v1/auth/oauth2/register')
      .send({
        client_name: `P7 revoke ${method} ${randomUUID()}`,
        application_type: 'native',
        redirect_uris: ['http://127.0.0.1:31415/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: method,
      }).expect(201);
    return registered.body as OAuthClientFixture;
  }

  // OAuth code exchange is covered by the official SDK smoke. These issued,
  // database-backed JWT fixtures isolate RFC 7009 client-authentication cases.
  async function issueToken(client: OAuthClientFixture, expiresIn = 3600, resource = auth.getMcpResourceUri()): Promise<string> {
    const referenceId = randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    const api = auth.auth.api as unknown as {
      signJWT(input: { body: { payload: Record<string, unknown> } }): Promise<{ token: string }>;
    };
    const signed = await api.signJWT({ body: { payload: {
      sub: userId, azp: client.client_id, client_id: client.client_id,
      scope: 'course:read', aud: resource, iss: auth.getMcpIssuer(), exp: expiresAt, jti: referenceId,
    } } });
    if (!await prisma.oauthConsent.findFirst({ where: { clientId: client.client_id, userId } })) {
      await prisma.oauthConsent.create({ data: {
        clientId: client.client_id, userId, scopes: ['course:read'], resources: [resource],
      } });
    }
    await prisma.oauthAccessToken.create({ data: {
      token: signed.token, referenceId, clientId: client.client_id, userId,
      scopes: ['course:read'], resources: [resource], expiresAt: new Date(expiresAt * 1000),
    } });
    return signed.token;
  }

  async function ledger(token: string) {
    return prisma.oauthAccessToken.findFirstOrThrow({ where: { token } });
  }

  it('revokes an owned public-client JWT, fails subsequent MCP access and keeps repeated revocation idempotent', async () => {
    const token = await issueToken(publicClient);
    await expect(auth.verifyMcpToken(token)).resolves.toMatchObject({ clientId: publicClient.client_id });
    await request(app.getHttpServer()).post(endpoint).type('form')
      .send({ token, client_id: publicClient.client_id, token_type_hint: 'access_token' })
      .expect('Cache-Control', 'no-store').expect(200);
    const revoked = (await ledger(token)).revoked;
    expect(revoked).toBeInstanceOf(Date);
    await request(app.getHttpServer()).post('/api/v1/mcp').set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).expect(401);
    await request(app.getHttpServer()).post(endpoint).type('form')
      .send({ token, client_id: publicClient.client_id }).expect(200);
    expect((await ledger(token)).revoked).toEqual(revoked);
  });

  it('returns a nonrevealing success for another registered client without revoking the token', async () => {
    const token = await issueToken(publicClient);
    const response = await request(app.getHttpServer()).post(endpoint).type('form')
      .send({ token, client_id: otherClient.client_id }).expect(200);
    expect(response.body).toEqual({});
    expect((await ledger(token)).revoked).toBeNull();
    await expect(auth.verifyMcpToken(token)).resolves.toMatchObject({ clientId: publicClient.client_id });
  });

  it('does not accept a browser session, unknown client, or missing OAuth client credentials', async () => {
    const token = await issueToken(publicClient);
    for (const body of [{ token }, { token, client_id: 'unknown-revoking-client' }]) {
      const response = await request(app.getHttpServer()).post(endpoint).type('form')
        .set('Cookie', browserCookie).send(body);
      expect([400, 401]).toContain(response.status);
      expect(response.body.error).toMatch(/invalid_client|invalid_request/);
      expect((await ledger(token)).revoked).toBeNull();
    }
  });

  it('requires the registered confidential Basic authentication method and its correct secret', async () => {
    const token = await issueToken(basicClient);
    const missing = await request(app.getHttpServer()).post(endpoint).type('form')
      .send({ token, client_id: basicClient.client_id });
    expect([400, 401]).toContain(missing.status);
    expect(missing.body.error).toBe('invalid_client');
    const wrong = await request(app.getHttpServer()).post(endpoint).type('form')
      .auth(basicClient.client_id, 'wrong-client-secret').send({ token });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe('invalid_client');
    const wrongMethod = await request(app.getHttpServer()).post(endpoint).type('form')
      .send({ token, client_id: basicClient.client_id, client_secret: basicClient.client_secret });
    expect([400, 401]).toContain(wrongMethod.status);
    expect(wrongMethod.body.error).toBe('invalid_client');
    expect((await ledger(token)).revoked).toBeNull();
    await request(app.getHttpServer()).post(endpoint).type('form')
      .auth(basicClient.client_id, basicClient.client_secret!).send({ token }).expect(200);
    expect((await ledger(token)).revoked).toBeInstanceOf(Date);
  });

  it('supports the registered confidential POST method without weakening its secret validation', async () => {
    const token = await issueToken(postClient);
    const wrong = await request(app.getHttpServer()).post(endpoint).type('form')
      .send({ token, client_id: postClient.client_id, client_secret: 'wrong-client-secret' });
    expect([400, 401]).toContain(wrong.status);
    expect(wrong.body.error).toBe('invalid_client');
    expect((await ledger(token)).revoked).toBeNull();
    await request(app.getHttpServer()).post(endpoint).type('form')
      .send({ token, client_id: postClient.client_id, client_secret: postClient.client_secret }).expect(200);
    expect((await ledger(token)).revoked).toBeInstanceOf(Date);
  });

  it('keeps unknown/refresh token behavior with the provider and permits revoking expired tracked tokens', async () => {
    // Better Auth 1.7.14 returns invalid_request for these unknown tokens. The
    // ULE adapter deliberately leaves provider-owned token formats unchanged.
    const unknown = await request(app.getHttpServer()).post(endpoint).type('form')
      .send({ token: 'unknown-opaque-token', client_id: publicClient.client_id }).expect(400);
    expect(unknown.body).toMatchObject({ error: 'invalid_request' });
    const unknownRefresh = await request(app.getHttpServer()).post(endpoint).type('form')
      .send({ token: 'unknown-refresh-token', client_id: publicClient.client_id, token_type_hint: 'refresh_token' }).expect(400);
    expect(unknownRefresh.body).toMatchObject({ error: 'invalid_request' });
    const token = await issueToken(publicClient);
    await request(app.getHttpServer()).post(endpoint).type('form')
      .send({ token, client_id: publicClient.client_id, token_type_hint: 'refresh_token' }).expect(400);
    expect((await ledger(token)).revoked).toBeNull();
    const expired = await issueToken(publicClient, -60);
    await request(app.getHttpServer()).post(endpoint).type('form')
      .send({ token: expired, client_id: publicClient.client_id }).expect(200);
    expect((await ledger(expired)).revoked).toBeInstanceOf(Date);
  });
});
