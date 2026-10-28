import { Environment, validate } from '../src/config/validation';

describe('Configuration Validation', () => {
  it('should validate a valid configuration object successfully', () => {
    const validConfig = {
      NODE_ENV: 'development',
      PORT: '3000',
      API_PREFIX: 'api/v1',
      CORS_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ule_dev',
    };

    const result = validate(validConfig);

    expect(result.NODE_ENV).toBe(Environment.Development);
    expect(result.PORT).toBe(3000);
    expect(result.API_PREFIX).toBe('api/v1');
    expect(result.DATABASE_URL).toBe(
      'postgresql://postgres:postgres@localhost:5432/ule_dev',
    );
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
