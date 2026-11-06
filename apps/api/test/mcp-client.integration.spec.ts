import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  auth,
  OAuthClientProvider,
  OAuthDiscoveryState,
  UnauthorizedError,
} from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { MCP_AUTHORING_TOOLS } from '@ule/contracts';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/** In-memory credentials for one test client; nothing is written to client config. */
class TestOAuthProvider implements OAuthClientProvider {
  readonly redirectUrl = 'http://127.0.0.1:31415/callback';
  readonly expectedState = randomUUID();
  readonly clientMetadata: OAuthClientMetadata & { application_type: 'native' } = {
    client_name: 'ULE P7-05 official SDK smoke',
    redirect_uris: [this.redirectUrl],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'native',
  };
  information?: OAuthClientInformationMixed;
  savedTokens?: OAuthTokens;
  authorizationUrl?: URL;
  discovery?: OAuthDiscoveryState;
  private verifier = '';

  state() { return this.expectedState; }
  clientInformation() { return this.information; }
  saveClientInformation(value: OAuthClientInformationMixed) { this.information = value; }
  tokens() { return this.savedTokens; }
  saveTokens(value: OAuthTokens) { this.savedTokens = value; }
  redirectToAuthorization(value: URL) { this.authorizationUrl = value; }
  saveCodeVerifier(value: string) { this.verifier = value; }
  codeVerifier() { return this.verifier; }
  saveDiscoveryState(value: OAuthDiscoveryState) { this.discovery = value; }
  discoveryState() { return this.discovery; }
}

function cookies(response: request.Response): string {
  const values = response.headers['set-cookie'];
  return (Array.isArray(values) ? values : values ? [values] : [])
    .map((value: string) => value.split(';')[0]).join('; ');
}

describe('P7-05 official MCP SDK OAuth client (real HTTP and PostgreSQL)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let resourceUrl: URL;
  const origin = 'http://localhost:5173';

  beforeAll(async () => {
    // Reserve an ephemeral port before auth initialization so discovery, issuer,
    // resource audience and actual socket use the same URL (no fetch rewriting).
    const reservation = createServer();
    await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const address = reservation.address();
    if (!address || typeof address === 'string') throw new Error('No TCP address');
    const port = address.port;
    await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
    baseUrl = `http://127.0.0.1:${port}`;
    resourceUrl = new URL(`${baseUrl}/api/v1/mcp`);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({
        ...process.env,
        BETTER_AUTH_URL: baseUrl,
        MCP_RESOURCE_URI: resourceUrl.href,
        API_PREFIX: 'api/v1',
        CORS_ORIGIN: origin,
      }))
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: ['/.well-known/(.*)', '.well-known/(.*)', 'auth/login', '/auth/login', 'auth/consent', '/auth/consent'],
    });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(port, '127.0.0.1');
  });

  afterAll(async () => { await app?.close(); });

  async function authorizeInBrowser(provider: TestOAuthProvider): Promise<string> {
    const authorizationUrl = provider.authorizationUrl;
    expect(authorizationUrl).toBeDefined();
    expect(authorizationUrl!.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizationUrl!.searchParams.get('code_challenge')).toBeTruthy();
    expect(authorizationUrl!.searchParams.get('resource')).toBe(resourceUrl.href);
    expect(authorizationUrl!.searchParams.get('redirect_uri')).toBe(provider.redirectUrl);

    const unauthenticated = await request(baseUrl)
      .get(authorizationUrl!.pathname + authorizationUrl!.search).expect(302);
    const loginUrl = new URL(unauthenticated.headers.location, baseUrl);
    expect(loginUrl.pathname).toBe('/auth/login');
    const loginPage = await request(baseUrl).get(loginUrl.pathname + loginUrl.search).expect(200);
    expect(loginPage.text).toContain('Sign In to ULE');

    const account = {
      email: `p7_client_${randomUUID()}@ule.internal`,
      password: 'P7-05-smoke-password!',
      name: 'P7 SDK creator',
    };
    await request(baseUrl).post('/api/v1/auth/sign-up/email').set('Origin', origin).send(account).expect(200);
    const login = await request(baseUrl).post('/api/v1/auth/sign-in/email').set('Origin', origin)
      .send({ email: account.email, password: account.password }).expect(200);
    const sessionCookie = cookies(login);
    const authorize = await request(baseUrl).get(authorizationUrl!.pathname + authorizationUrl!.search)
      .set('Cookie', sessionCookie).expect(302);
    const consentUrl = new URL(authorize.headers.location, baseUrl);
    expect(consentUrl.pathname).toBe('/auth/consent');
    const consentPage = await request(baseUrl).get(consentUrl.pathname + consentUrl.search).expect(200);
    expect(consentPage.text).toContain('Authorize Application');
    const consent = await request(baseUrl).post('/api/v1/auth/oauth2/consent')
      .set('Origin', origin).set('Cookie', [sessionCookie, cookies(authorize)].filter(Boolean).join('; '))
      .send({ accept: true, scope: authorizationUrl!.searchParams.get('scope'), oauth_query: consentUrl.search.slice(1) })
      .expect(200);
    const callbackUrl = new URL(consent.body.url);
    expect(callbackUrl.origin + callbackUrl.pathname).toBe(provider.redirectUrl);
    expect(callbackUrl.searchParams.get('state')).toBe(provider.expectedState);
    const code = callbackUrl.searchParams.get('code');
    expect(code).toBeTruthy();
    return code!;
  }

  it('serves RFC 8414 metadata for the configured issuer and rejects other issuer paths', async () => {
    const metadata = await request(baseUrl).get('/.well-known/oauth-authorization-server/api/v1/auth').expect(200);
    expect(metadata.body).toMatchObject({
      issuer: `${baseUrl}/api/v1/auth`,
      authorization_endpoint: `${baseUrl}/api/v1/auth/oauth2/authorize`,
      token_endpoint: `${baseUrl}/api/v1/auth/oauth2/token`,
      registration_endpoint: `${baseUrl}/api/v1/auth/oauth2/register`,
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['course:read', 'course:write'],
    });
    await request(baseUrl).get('/.well-known/oauth-authorization-server/not-the-issuer').expect(404);
  });

  it('challenges anonymous initialize before any SSE or tool discovery starts', async () => {
    const response = await request(baseUrl).post('/api/v1/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'anonymous-client', version: '1.0.0' },
      } }).expect(401);
    expect(response.headers['www-authenticate']).toContain(`resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`);
    expect(response.body).toMatchObject({ jsonrpc: '2.0', id: 1, error: { code: -32001 } });
  });

  it('discovers OAuth from a 401 challenge, dynamically registers, negotiates protocol and lists exactly 17 tools', async () => {
    const provider = new TestOAuthProvider();
    const redirects = jest.spyOn(provider, 'redirectToAuthorization');
    const registrations = jest.spyOn(provider, 'saveClientInformation');
    const authorizationTransport = new StreamableHTTPClientTransport(resourceUrl, { authProvider: provider });
    const transport = new StreamableHTTPClientTransport(resourceUrl, { authProvider: provider });
    const client = new Client({ name: 'ule-p7-sdk-discovery', version: '1.0.0' }, { capabilities: {} });
    try {
      // Starting OAuth at initialize prevents an anonymous initialized client
      // from launching competing GET-SSE and tools/list authorization flows.
      await expect(client.connect(authorizationTransport)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(provider.discovery?.resourceMetadata?.resource).toBe(resourceUrl.href);
      expect(provider.discovery?.authorizationServerUrl).toBe(`${baseUrl}/api/v1/auth`);
      expect(provider.discovery?.authorizationServerMetadata?.registration_endpoint).toBeTruthy();
      expect(provider.information?.client_id).toBeTruthy();
      expect(provider.information).toMatchObject({ token_endpoint_auth_method: 'none' });

      await authorizationTransport.finishAuth(await authorizeInBrowser(provider));
      await authorizationTransport.close();
      await client.connect(transport);
      expect(registrations).toHaveBeenCalledTimes(1);
      expect(redirects).toHaveBeenCalledTimes(1);
      expect(provider.savedTokens?.token_type.toLowerCase()).toBe('bearer');
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(17);
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual(Object.values(MCP_AUTHORING_TOOLS).sort());
      expect(transport.protocolVersion).toBe('2025-11-25');
      const result = await client.callTool({ name: 'ule_list_block_types', arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'text', text: expect.stringContaining('cloze') })]));
    } finally {
      await authorizationTransport.close();
      await client.close();
    }
  });

  it('uses an explicitly read-only OAuth grant, rejects mutation and rejects its revoked token', async () => {
    const provider = new TestOAuthProvider();
    // SDK scope override exercises deliberate least-privilege registration and
    // consent; the standard discovery flow above requests both advertised scopes.
    expect(await auth(provider, { serverUrl: resourceUrl, scope: 'course:read' })).toBe('REDIRECT');
    expect(provider.authorizationUrl?.searchParams.get('scope')).toBe('course:read');
    const transport = new StreamableHTTPClientTransport(resourceUrl, { authProvider: provider });
    await transport.finishAuth(await authorizeInBrowser(provider));
    expect(provider.savedTokens?.scope?.split(' ')).toEqual(['course:read']);
    const client = new Client({ name: 'ule-p7-sdk-readonly', version: '1.0.0' }, { capabilities: {} });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toHaveLength(17);
      const read = await client.callTool({ name: 'ule_list_my_courses', arguments: {} });
      expect(read.isError).not.toBe(true);
      const write = await client.callTool({ name: 'ule_create_private_course', arguments: { title: 'Denied SDK creation', idempotencyKey: randomUUID() } });
      expect(write.isError).toBe(true);
      expect(JSON.stringify(write.content)).toContain('Insufficient scope');

      const token = provider.savedTokens!.access_token;
      await request(baseUrl).post('/api/v1/auth/oauth2/revoke')
        .type('form').send({ token, client_id: provider.information!.client_id, token_type_hint: 'access_token' }).expect(200);
      // Use the same token without an auth provider: this checks rejection rather
      // than allowing the client SDK to reauthorize or refresh automatically.
      const revokedClient = new Client({ name: 'ule-p7-sdk-revoked', version: '1.0.0' }, { capabilities: {} });
      try {
        await expect(revokedClient.connect(new StreamableHTTPClientTransport(resourceUrl, {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }))).rejects.toMatchObject({ code: 401, message: expect.stringContaining('revoked') });
      } finally {
        await revokedClient.close();
      }
    } finally {
      await client.close();
    }
  });

  it('keeps native DCR bound to its callback and requires PKCE at authorization and token exchange', async () => {
    const provider = new TestOAuthProvider();
    expect(await auth(provider, { serverUrl: resourceUrl, scope: 'course:read' })).toBe('REDIRECT');
    const wrongRedirect = new URL(provider.authorizationUrl!);
    wrongRedirect.searchParams.set('redirect_uri', 'http://127.0.0.1:31415/different-callback');
    const rejectedRedirect = await request(baseUrl).get(wrongRedirect.pathname + wrongRedirect.search).expect(302);
    const redirectError = new URL(rejectedRedirect.headers.location);
    expect(redirectError.origin).toBe(baseUrl);
    expect(redirectError.searchParams.get('error')).toBeTruthy();
    expect(redirectError.searchParams.has('code')).toBe(false);

    const noPkce = new URL(provider.authorizationUrl!);
    noPkce.searchParams.delete('code_challenge');
    noPkce.searchParams.delete('code_challenge_method');
    const rejectedPkce = await request(baseUrl).get(noPkce.pathname + noPkce.search).expect(302);
    const errorCallback = new URL(rejectedPkce.headers.location);
    expect(errorCallback.searchParams.get('error')).toBe('invalid_request');
    expect(errorCallback.searchParams.has('code')).toBe(false);

    const code = await authorizeInBrowser(provider);
    provider.saveCodeVerifier(randomUUID() + randomUUID());
    await expect(auth(provider, { serverUrl: resourceUrl, authorizationCode: code })).rejects.toThrow(/code|verifier|PKCE/i);

    await request(baseUrl).post('/api/v1/auth/oauth2/register')
      .send({ ...provider.clientMetadata, grant_types: ['client_credentials'] }).expect(400);
  });
});
