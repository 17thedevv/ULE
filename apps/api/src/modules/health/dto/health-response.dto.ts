import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ComponentStatus,
  DatabaseHealth,
  HealthCheckResponse,
  HealthStatus,
} from '@ule/contracts';

export class DatabaseHealthDto implements DatabaseHealth {
  @ApiProperty({
    description: 'PostgreSQL connection status',
    example: 'up',
    enum: ['up', 'down'],
  })
  status!: ComponentStatus;

  @ApiPropertyOptional({
    description: 'Database query latency in milliseconds',
    example: 4,
  })
  latencyMs?: number;

  @ApiPropertyOptional({
    description: 'Error message if database connection or ping failed',
    example: 'Connection refused',
  })
  error?: string;
}

export class HealthResponseDto implements HealthCheckResponse {
  @ApiProperty({
    description: 'Overall system health status',
    example: 'ok',
    enum: ['ok', 'degraded', 'down'],
  })
  status!: HealthStatus;

  @ApiProperty({
    description: 'ISO-8601 timestamp of the health check evaluation',
    example: '2026-10-27T14:15:00.000Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'Current API version identifier',
    example: 'v1',
  })
  version!: string;

  @ApiProperty({
    description: 'Process uptime in seconds',
    example: 124.5,
  })
  uptimeSeconds!: number;

  @ApiProperty({
    description: 'Database connectivity and readiness status',
    type: DatabaseHealthDto,
  })
  database!: DatabaseHealthDto;
}
