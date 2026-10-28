import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api/v1';

  @IsString()
  @Matches(/^(?!.*\*).*$/, {
    message:
      'CORS_ORIGIN cannot contain wildcard "*" when credentialed requests are enabled.',
  })
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:5173';

  @IsString({
    message:
      'DATABASE_URL must be a valid PostgreSQL connection string (e.g. postgresql://user:pass@localhost:5432/db)',
  })
  @Matches(/^postgresql:\/\/.+/, {
    message:
      'DATABASE_URL must be a valid PostgreSQL connection string (e.g. postgresql://user:pass@localhost:5432/db)',
  })
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  BETTER_AUTH_SECRET?: string;

  @IsString()
  @IsOptional()
  BETTER_AUTH_URL?: string = 'http://localhost:3000';
}

const SENSITIVE_KEY_PATTERN = /(url|secret|token|password|key|credential)/i;

export function redactSensitiveValue(key: string, value: unknown): string {
  if (value === undefined || value === null) {
    return 'undefined';
  }
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }
  return JSON.stringify(value);
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorDetails = errors
      .map((err) => {
        const constraints = err.constraints
          ? Object.values(err.constraints).join(', ')
          : 'Invalid value';
        const safeValue = redactSensitiveValue(err.property, config[err.property]);
        return `  - ${err.property}: ${constraints} (received: ${safeValue})`;
      })
      .join('\n');

    throw new Error(
      `[ULE Configuration Error] Invalid environment configuration:\n${errorDetails}\n\nPlease verify your .env file or environment variables against .env.example.`,
    );
  }

  return validatedConfig;
}
