import { Environment, validate } from '../src/config/validation';

describe('Configuration Validation', () => {
  it('should validate a valid configuration object successfully', () => {
    const validConfig = {
      NODE_ENV: 'development',
      PORT: '3000',
      API_PREFIX: 'api/v1',
      CORS_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ule_dev',
      BETTER_AUTH_SECRET: 'super-secret-auth-key-1234567890',
      BETTER_AUTH_URL: 'http://localhost:3000',
    };

    const result = validate(validConfig);

    expect(result.NODE_ENV).toBe(Environment.Development);
    expect(result.PORT).toBe(3000);
    expect(result.API_PREFIX).toBe('api/v1');
    expect(result.DATABASE_URL).toBe(
      'postgresql://postgres:postgres@localhost:5432/ule_dev',
    );
    expect(result.BETTER_AUTH_SECRET).toBe('super-secret-auth-key-1234567890');
    expect(result.BETTER_AUTH_URL).toBe('http://localhost:3000');
  });

  it('should throw an informative error when DATABASE_URL is missing', () => {
    const invalidConfig = {
      NODE_ENV: 'development',
      PORT: '3000',
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
    };

    expect(() => validate(invalidConfig)).toThrow(
      /DATABASE_URL.*received: \[REDACTED\]/,
    );
    expect(() => validate(invalidConfig)).not.toThrow(/super_secret_pw/);
  });

  it('should reject wildcard "*" in CORS_ORIGIN to prevent credentialed CORS misconfiguration', () => {
    const invalidConfig = {
      DATABASE_URL: 'postgresql://localhost:5432/db',
      CORS_ORIGIN: '*',
    };

    expect(() => validate(invalidConfig)).toThrow(
      /CORS_ORIGIN cannot contain wildcard "\*"/,
    );
  });

  it('should throw an informative error when NODE_ENV is invalid', () => {
    const invalidConfig = {
      NODE_ENV: 'invalid_env',
      DATABASE_URL: 'postgresql://localhost:5432/db',
    };

    expect(() => validate(invalidConfig)).toThrow(
      /NODE_ENV must be one of the following values/,
    );
  });
});
