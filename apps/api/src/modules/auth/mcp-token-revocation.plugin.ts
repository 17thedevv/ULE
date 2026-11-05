import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { getOAuthProviderApi, type OAuthOptions } from '@better-auth/oauth-provider';
import { PrismaService } from '../prisma/prisma.service';

/** Adds RFC 7009 revocation for the JWTs tracked by ULE's MCP token ledger. */
export function mcpTokenRevocation(
  prisma: PrismaService,
  resource: string,
  providerOptions: OAuthOptions<string[]>,
): BetterAuthPlugin {
  return {
    id: 'ule-mcp-token-revocation',
    hooks: {
      before: [{
        matcher: (ctx) => ctx.path === '/oauth2/revoke',
        handler: createAuthMiddleware(async (ctx) => {
          const token = ctx.body?.token;
          if (typeof token !== 'string' || ctx.body?.token_type_hint === 'refresh_token') return;

          // The provider owns refresh/opaque/unknown token behavior. Only ULE's
          // exact, server-issued MCP JWTs have this authoritative ledger entry.
          const issued = await prisma.oauthAccessToken.findFirst({
            where: { token, resources: { has: resource } },
            select: { clientId: true },
          });
          if (!issued) return;

          // Use the provider's exported companion-plugin API, including its
          // registered auth method, hashed secrets and assertion validation.
          // Public clients require their id; confidential clients still require
          // their configured credentials. Possessing a browser cookie is not
          // a substitute for the OAuth client's authentication.
          const caller = await getOAuthProviderApi(ctx, providerOptions)
            .authenticateClient({ requireCredentials: false });
          if (caller.clientId === issued.clientId) {
            await prisma.oauthAccessToken.updateMany({
              where: { token, clientId: caller.clientId, resources: { has: resource }, revoked: null },
              data: { revoked: new Date() },
            });
          }

          // RFC 7009: repeated and other-client tokens are indistinguishable
          // successful no-ops. Do not require active consent or an unexpired JWT
          // merely to revoke its already-authoritative issuance record.
          ctx.setHeader('Cache-Control', 'no-store');
          ctx.setHeader('Pragma', 'no-cache');
          return ctx.json({});
        }),
      }],
    },
  };
}
