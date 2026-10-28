import { Environment, validate } from '../src/config/validation';

describe('Configuration Validation', () => {
  const validSecret = 'super-secret-auth-key-1234567890-32-chars-long';
  const validDbUrl = 'postgresql://postgres:postgres@localhost:5432/ule_dev';

  it('should validate a valid configuration object successfully', () => {
    const validConfig = {
      NODE_ENV: 'development',
      PORT: '3000',
      API_PREFIX: 'api/v1',
      CORS_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: validDbUrl,
      BETTER_AUTH_SECRET: validSecret,
      BETTER_AUTH_URL: 'http://localhost:3000',
    };

    const result = validate(validConfig);

    expect(result.NODE_ENV).toBe(Environment.Development);
    expect(result.PORT).toBe(3000);
    expect(result.API_PREFIX).toBe('api/v1');
    expect(result.DATABASE_URL).toBe(validDbUrl);
    expect(result.BETTER_AUTH_SECRET).toBe(validSecret);
    expect(result.BETTER_AUTH_URL).toBe('http://localhost:3000');
  });

  it('should throw an informative error when DATABASE_URL is missing', () => {
    const invalidConfig = {
      NODE_ENV: 'development',
      PORT: '3000',
      BETTER_AUTH_SECRET: validSecret,
    };

    expect(() => validate(invalidConfig)).toThrow(
      /DATABASE_URL must be a valid PostgreSQL connection string/,
    );
  });

  it('should redact DATABASE_URL value when validation fails without leaking credentials', () => {
    const invalidConfig = {
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: 'mysql://user:super_secret_pw@localhost:3306/db', // invalid protocol
      BETTER_AUTH_SECRET: validSecret,
    };

    expect(() => validate(invalidConfig)).toThrow(
      /DATABASE_URL.*received: \[REDACTED\]/,
    );
    expect(() => validate(invalidConfig)).not.toThrow(/super_secret_pw/);
  });

  it('should throw an informative error when BETTER_AUTH_SECRET is missing', () => {
    const invalidConfig = {
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: validDbUrl,
    };

    expect(() => validate(invalidConfig)).toThrow(
      /BETTER_AUTH_SECRET must be configured as a non-empty string/,
    );
  });

  it('should throw an informative error when BETTER_AUTH_SECRET is shorter than 32 characters', () => {
    const invalidConfig = {
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: validDbUrl,
      BETTER_AUTH_SECRET: 'too-short-secret',
    };

    expect(() => validate(invalidConfig)).toThrow(
      /BETTER_AUTH_SECRET must be at least 32 characters long/,
    );
  });

  it('should redact BETTER_AUTH_SECRET value in error message when validation fails', () => {
    const sensitiveSecret = 'short-secret-leaked-raw-value';
    const invalidConfig = {
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: validDbUrl,
      BETTER_AUTH_SECRET: sensitiveSecret,
    };

    expect(() => validate(invalidConfig)).toThrow(
      /BETTER_AUTH_SECRET.*received: \[REDACTED\]/,
    );
    expect(() => validate(invalidConfig)).not.toThrow(sensitiveSecret);
  });

  it('should reject wildcard "*" in CORS_ORIGIN to prevent credentialed CORS misconfiguration', () => {
    const invalidConfig = {
      DATABASE_URL: validDbUrl,
      BETTER_AUTH_SECRET: validSecret,
      CORS_ORIGIN: '*',
    };

    expect(() => validate(invalidConfig)).toThrow(
      /CORS_ORIGIN cannot contain wildcard "\*"/,
    );
  });

  it('should throw an informative error when NODE_ENV is invalid', () => {
    const invalidConfig = {
      NODE_ENV: 'invalid_env',
      DATABASE_URL: validDbUrl,
      BETTER_AUTH_SECRET: validSecret,
    };

    expect(() => validate(invalidConfig)).toThrow(
      /NODE_ENV must be one of the following values/,
    );
  });
});
