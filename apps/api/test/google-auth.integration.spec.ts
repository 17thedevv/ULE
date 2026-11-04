import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/modules/prisma/prisma.service';

const WEB_ORIGIN = 'http://localhost:5173';
const API_ORIGIN = 'http://localhost:3000';
const API = '/api/v1';
const AUTH = API + '/auth';
const CALLBACK = AUTH + '/callback/google';
const CLIENT_ID = 'ule-integration-test.apps.googleusercontent.com';
const CLIENT_SECRET = 'google-oauth-test-fixture';
const SUCCESS_URL = WEB_ORIGIN + '/auth/complete';
const ERROR_URL = WEB_ORIGIN + '/auth/complete?mode=link';
const PASSWORD = 'IntegrationPassword123!';

type Browser = ReturnType<typeof request.agent>;
type GoogleIdentity = { sub: string; email: string; email_verified: boolean };
type OAuthFlow = { state: string; codeChallenge: string };

function credentials() {
  return { email: 'google-test-' + randomUUID() + '@example.com', password: PASSWORD };
}

function identity(email: string, verified = true): GoogleIdentity {
  return { sub: randomUUID(), email, email_verified: verified };
}

describe('Google authentication with Better Auth and PostgreSQL (mocked Google upstream)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const fixtureEmails = new Set<string>();
  const googleCodes = new Map<string, { token: string; challenge: string }>();
  let googleKey: Awaited<ReturnType<typeof generateKeyPair>>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({
        DATABASE_URL: process.env.DATABASE_URL,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: API_ORIGIN,
        API_PREFIX: 'api/v1',
        CORS_ORIGIN: WEB_ORIGIN,
        GOOGLE_CLIENT_ID: CLIENT_ID,
        GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
      }))
      .compile();
    app = module.createNestApplication();
    prisma = app.get(PrismaService);
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    googleKey = await generateKeyPair('RS256', { extractable: true });
    const jwk = { ...await exportJWK(googleKey.publicKey), kid: 'integration-google-key', alg: 'RS256' };
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const outgoing = new Request(input, init);
      if (outgoing.url === 'https://www.googleapis.com/oauth2/v3/certs') {
        return Response.json({ keys: [jwk] });
      }
      if (outgoing.url !== 'https://oauth2.googleapis.com/token' || outgoing.method !== 'POST') {
        throw new Error('Unexpected upstream request in Google authentication integration test');
      }
      const body = new URLSearchParams(await outgoing.text());
      const code = body.get('code') ?? '';
      const fixture = googleCodes.get(code);
      const challenge = createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url');
      if (!fixture || challenge !== fixture.challenge ||
        body.get('grant_type') !== 'authorization_code' || body.get('redirect_uri') !== API_ORIGIN + CALLBACK ||
        body.get('client_id') !== CLIENT_ID || body.get('client_secret') !== CLIENT_SECRET) {
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      googleCodes.delete(code);
      return Response.json({
        id_token: fixture.token,
        access_token: 'fixture-google-access-token',
        expires_in: 3600,
        scope: 'openid email profile',
        token_type: 'Bearer',
      });
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (!app) return;
    try {
      await prisma.course.deleteMany({ where: { owner: { email: { in: [...fixtureEmails] } } } });
      await prisma.user.deleteMany({ where: { email: { in: [...fixtureEmails] } } });
    } finally {
      await app.close();
    }
  });

  const browser = () => request.agent(app.getHttpServer());

  async function signUp(client: Browser, account = credentials()) {
    fixtureEmails.add(account.email);
    const response = await client.post(AUTH + '/sign-up/email').set('Origin', WEB_ORIGIN)
      .send({ ...account, name: 'Email account' }).expect(HttpStatus.OK);
    return { ...account, id: response.body.user.id as string };
  }

  async function beginGoogle(client: Browser, action: 'sign-in/social' | 'link-social'): Promise<OAuthFlow> {
    const response = await client.post(AUTH + '/' + action).set('Origin', WEB_ORIGIN).send({
      provider: 'google',
      callbackURL: SUCCESS_URL,
      errorCallbackURL: ERROR_URL,
      disableRedirect: true,
    }).expect(HttpStatus.OK);
    const authorization = new URL(response.body.url);
    expect(authorization.origin + authorization.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authorization.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(authorization.searchParams.get('redirect_uri')).toBe(API_ORIGIN + CALLBACK);
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('scope')?.split(' ').sort()).toEqual(['email', 'openid', 'profile']);
    const state = authorization.searchParams.get('state') ?? '';
    const codeChallenge = authorization.searchParams.get('code_challenge') ?? '';
    expect(state).not.toBe('');
    expect(codeChallenge).not.toBe('');
    return { state, codeChallenge };
  }

  async function callback(client: Browser, flow: OAuthFlow, googleUser: GoogleIdentity) {
    fixtureEmails.add(googleUser.email.toLowerCase());
    const code = randomUUID();
    const token = await new SignJWT({ ...googleUser, name: 'Google account' })
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-google-key' })
      .setIssuer('https://accounts.google.com').setAudience(CLIENT_ID).setIssuedAt()
      .setExpirationTime('5m').sign(googleKey.privateKey);
    googleCodes.set(code, { token, challenge: flow.codeChallenge });
    try {
      const response = await client.get(CALLBACK).query({ code, state: flow.state }).expect(HttpStatus.FOUND);
      return new URL(response.headers.location, API_ORIGIN);
    } finally {
      googleCodes.delete(code);
    }
  }

  async function assertNoGoogleAccount(userId: string) {
    expect(await prisma.account.count({ where: { userId, providerId: 'google' } })).toBe(0);
  }

  it('authenticates and signs in again as one new user through the authorization code callback', async () => {
    const first = browser();
    await first.get(AUTH + '/providers').expect(HttpStatus.OK).expect('Cache-Control', 'no-store').expect({ google: true });
    const googleUser = identity(credentials().email);
    const firstRedirect = await callback(first, await beginGoogle(first, 'sign-in/social'), googleUser);
    expect(firstRedirect.href).toBe(SUCCESS_URL);
    const me = await first.get(API + '/me').expect(HttpStatus.OK);
    expect(me.body.user).toMatchObject({ email: googleUser.email });
    expect(me.body.user.id).toBeTruthy();
    await first.get(API + '/learner/courses').expect(HttpStatus.OK).expect([]);
    await first.get(API + '/courses').expect(HttpStatus.OK).expect([]);
    await first.post(AUTH + '/sign-out').set('Origin', WEB_ORIGIN).expect(HttpStatus.OK);
    await first.get(API + '/me').expect(HttpStatus.UNAUTHORIZED);

    const second = browser();
    expect((await callback(second, await beginGoogle(second, 'sign-in/social'), googleUser)).href).toBe(SUCCESS_URL);
    const meAgain = await second.get(API + '/me').expect(HttpStatus.OK);
    expect(meAgain.body.user.id).toBe(me.body.user.id);
    expect(await prisma.user.count({ where: { email: googleUser.email } })).toBe(1);
    expect(await prisma.account.count({ where: { userId: me.body.user.id, providerId: 'google', accountId: googleUser.sub } })).toBe(1);
  });

  it('blocks implicit same-email linking and preserves the credential user, ownership, grant and evaluated progress after explicit linking', async () => {
    const creator = browser();
    const learner = browser();
    await signUp(creator);
    const existing = await signUp(learner);
    const googleUser = identity(existing.email);
    const anonymous = browser();
    const denied = await callback(anonymous, await beginGoogle(anonymous, 'sign-in/social'), googleUser);
    expect(denied.origin + denied.pathname).toBe(SUCCESS_URL);
    expect(denied.searchParams.get('error')).toBe('account_not_linked');
    await anonymous.get(API + '/me').expect(HttpStatus.UNAUTHORIZED);
    await assertNoGoogleAccount(existing.id);

    const learnerCourse = await learner.post(API + '/courses').send({ title: 'Learner-owned course' }).expect(HttpStatus.CREATED);
    const course = await creator.post(API + '/courses').send({ title: 'Private addition course' }).expect(HttpStatus.CREATED);
    const coursePath = API + '/courses/' + course.body.course.id;
    const block = await creator.post(coursePath + '/draft/blocks').send({
      expectedRevision: 1,
      blockTypeId: 'multiple-choice',
      title: 'Addition check',
      config: {
        question: '2 + 3 = ?',
        options: [{ id: 'four', text: '4' }, { id: 'five', text: '5' }],
        answerKey: { correctOptionId: 'five' },
      },
    }).expect(HttpStatus.CREATED);
    const version = await creator.post(coursePath + '/versions').expect(HttpStatus.CREATED);
    const grant = await creator.post(coursePath + '/versions/' + version.body.id + '/grants')
      .send({ email: existing.email }).expect(HttpStatus.CREATED);
    const run = await learner.post(API + '/runs').send({
      courseVersionId: version.body.id, blockInstanceId: block.body.id, idempotencyKey: randomUUID(),
    }).expect(HttpStatus.CREATED);
    const runPath = API + '/runs/' + run.body.id;
    await learner.post(runPath + '/commands').send({
      command: 'SUBMIT_RESPONSE', idempotencyKey: randomUUID(), payload: { selectedOptionId: 'five' },
    }).expect(HttpStatus.OK);
    await learner.post(runPath + '/commands').send({
      command: 'FINISH', idempotencyKey: randomUUID(),
    }).expect(HttpStatus.OK);
    const learnerPath = API + '/learner/courses/' + version.body.id;
    const progress = (await learner.get(learnerPath + '/progress').expect(HttpStatus.OK)).body;
    const evidence = (await learner.get(learnerPath + '/evidence').expect(HttpStatus.OK)).body;
    expect(progress).toMatchObject({ completedBlocks: 1, percentComplete: 100 });
    expect(evidence).toEqual(expect.arrayContaining([expect.objectContaining({ isCorrect: true, score: 1 })]));

    const linked = await callback(learner, await beginGoogle(learner, 'link-social'), googleUser);
    expect(linked.href).toBe(SUCCESS_URL);
    const accounts = await learner.get(AUTH + '/list-accounts').expect(HttpStatus.OK);
    expect(accounts.body.map((account: { providerId: string }) => account.providerId).sort()).toEqual(['credential', 'google']);
    expect(accounts.body).toEqual(expect.arrayContaining([expect.objectContaining({ providerId: 'google', userId: existing.id })]));
    expect(await prisma.user.count({ where: { email: existing.email } })).toBe(1);
    await learner.post(AUTH + '/sign-out').set('Origin', WEB_ORIGIN).expect(HttpStatus.OK);

    const googleLogin = browser();
    expect((await callback(googleLogin, await beginGoogle(googleLogin, 'sign-in/social'), googleUser)).href).toBe(SUCCESS_URL);
    const me = await googleLogin.get(API + '/me').expect(HttpStatus.OK);
    expect(me.body.user.id).toBe(existing.id);
    await googleLogin.get(API + '/courses/' + learnerCourse.body.course.id + '/draft').expect(HttpStatus.OK);
    await googleLogin.get(coursePath + '/draft').expect(HttpStatus.NOT_FOUND);
    expect((await googleLogin.get(API + '/learner/courses').expect(HttpStatus.OK)).body)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: version.body.id })]));
    expect(await prisma.courseAccessGrant.findUnique({ where: { id: grant.body.id } }))
      .toMatchObject({ userId: existing.id, status: 'ACTIVE', courseVersionId: version.body.id });
    await googleLogin.get(learnerPath + '/progress').expect(HttpStatus.OK).expect(progress);
    await googleLogin.get(learnerPath + '/evidence').expect(HttpStatus.OK).expect(evidence);
    const result = await googleLogin.get(runPath + '/results').expect(HttpStatus.OK);
    expect(result.body.run).toMatchObject({ id: run.body.id, userId: existing.id, status: 'CLOSED' });
    expect(result.body.assessments).toEqual([expect.objectContaining({ isCorrect: true, score: 1 })]);
    const emailLogin = await browser().post(AUTH + '/sign-in/email').set('Origin', WEB_ORIGIN)
      .send({ email: existing.email, password: existing.password }).expect(HttpStatus.OK);
    expect(emailLogin.body.user.id).toBe(existing.id);
  });

  it('rejects anonymous link initiation and Google scopes outside basic identity', async () => {
    const client = browser();
    await client.post(AUTH + '/link-social').set('Origin', WEB_ORIGIN)
      .send({ provider: 'google', callbackURL: SUCCESS_URL }).expect(HttpStatus.UNAUTHORIZED);
    const extraScopes = await client.post(AUTH + '/sign-in/social').set('Origin', WEB_ORIGIN).send({
      provider: 'google', callbackURL: SUCCESS_URL, scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    }).expect(HttpStatus.BAD_REQUEST);
    expect(extraScopes.body.code).toBe('google_scopes_not_allowed');
    await client.post(AUTH + '/sign-in/social').set('Origin', WEB_ORIGIN)
      .send({ provider: 'google', idToken: { token: 'test-id-token' } }).expect(HttpStatus.NOT_FOUND);
    await client.get(API + '/me').expect(HttpStatus.UNAUTHORIZED);
  });

  it('returns to the application error callback without a session if Google reports cancellation', async () => {
    const client = browser();
    const flow = await beginGoogle(client, 'sign-in/social');
    const response = await client.get(CALLBACK).query({ state: flow.state, error: 'access_denied' })
      .expect(HttpStatus.FOUND);
    const redirect = new URL(response.headers.location, API_ORIGIN);
    expect(redirect.origin + redirect.pathname).toBe(SUCCESS_URL);
    expect(redirect.searchParams.get('error')).toBe('access_denied');
    await client.get(API + '/me').expect(HttpStatus.UNAUTHORIZED);
  });

  it.each([
    ['different email', 'link_email_mismatch'],
    ['unverified email', 'google_email_unverified'],
    ['signed-out session', 'link_session_required'],
    ['replaced session for the same user', 'link_session_required'],
  ])('rejects explicit linking with %s', async (scenario, error) => {
    const client = browser();
    const account = await signUp(client);
    const flow = await beginGoogle(client, 'link-social');
    const googleUser = identity(
      scenario === 'different email' ? credentials().email : account.email,
      scenario !== 'unverified email',
    );
    if (scenario === 'signed-out session' || scenario === 'replaced session for the same user') {
      await client.post(AUTH + '/sign-out').set('Origin', WEB_ORIGIN).expect(HttpStatus.OK);
    }
    if (scenario === 'replaced session for the same user') {
      await client.post(AUTH + '/sign-in/email').set('Origin', WEB_ORIGIN)
        .send({ email: account.email, password: account.password }).expect(HttpStatus.OK);
    }
    const redirect = await callback(client, flow, googleUser);
    expect(redirect.origin + redirect.pathname).toBe(SUCCESS_URL);
    expect(redirect.searchParams.get('error')).toBe(error);
    await assertNoGoogleAccount(account.id);
  });
});
