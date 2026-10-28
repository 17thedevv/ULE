import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
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
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:5173';

  @IsString({
    message:
      'DATABASE_URL must be a valid PostgreSQL connection string (e.g. postgresql://user:pass@localhost:5432/db)',
  })
  DATABASE_URL!: string;
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
        return `  - ${err.property}: ${constraints} (received: ${JSON.stringify(config[err.property])})`;
      })
      .join('\n');

    throw new Error(
      `[ULE Configuration Error] Invalid environment configuration:\n${errorDetails}\n\nPlease verify your .env file or environment variables against .env.example.`,
    );
  }

  return validatedConfig;
}
