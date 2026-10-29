import { ForbiddenException } from '@nestjs/common';

/**
 * ULE CORS Security Utility
 *
 * Rules:
 * 1. Wildcard origins ('*') are strictly disallowed when credentialed requests (cookies) are enabled.
 * 2. Only explicitly configured trusted origins are permitted.
 * 3. Legitimate non-browser requests without an Origin header (e.g. mobile apps, curl, server-to-server) are permitted.
 * 4. Origin matching is exact to prevent substring or regex bypasses.
 */
export function createCorsOriginValidator(corsOriginConfig: string) {
  if (!corsOriginConfig || corsOriginConfig.trim().length === 0) {
    throw new Error(
      '[ULE CORS Security] CORS_ORIGIN configuration cannot be empty.',
    );
  }

  const origins = corsOriginConfig
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (origins.includes('*')) {
    throw new Error(
      '[ULE CORS Security] Wildcard CORS origin ("*") is strictly prohibited when credentials are enabled. Configure explicit trusted origins (e.g. http://localhost:5173).',
    );
  }

  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ): void => {
    // Allow legitimate requests with no Origin header (curl, mobile apps, server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (origins.includes(origin)) {
      callback(null, true);
    } else {
      callback(
        new ForbiddenException(
          `Origin '${origin}' not allowed by CORS configuration.`,
        ),
      );
    }
  };
}
