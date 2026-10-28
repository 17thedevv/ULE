import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponseDto> {
    const dbPing = await this.prisma.ping();

    const isHealthy = dbPing.connected;
    const uptimeSeconds = Math.round((Date.now() - this.startTime) / 1000);

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: 'v1',
      uptimeSeconds,
      database: {
        status: dbPing.connected ? 'up' : 'down',
        latencyMs: dbPing.latencyMs,
        ...(isHealthy
          ? {}
          : { error: 'Database service is currently unreachable' }),
      },
    };
  }
}
