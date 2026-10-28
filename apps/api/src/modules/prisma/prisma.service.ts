import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { sanitizeLogMessage } from '../../common/utils/sanitize-error';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Optional() configService?: ConfigService) {
    const connectionString =
      configService?.get<string>('DATABASE_URL') || process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        '[PrismaService] DATABASE_URL is required but not configured. An explicit PostgreSQL connection string must be provided via the DATABASE_URL environment variable.',
      );
    }

    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to PostgreSQL database');
    } catch (error) {
      const err = error as Error;
      this.logger.warn(
        `Initial PostgreSQL connection attempt failed: ${sanitizeLogMessage(err.message)}. Database health will report down until reachable.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected from PostgreSQL');
  }

  /**
   * Performs an active database ping to verify PostgreSQL connectivity.
   */
  async ping(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      await this.$queryRaw`SELECT 1`;
      return {
        connected: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      const err = error as Error;
      const sanitized = sanitizeLogMessage(err.message);
      this.logger.warn(`PostgreSQL readiness check failed: ${sanitized}`);
      return {
        connected: false,
        latencyMs: Date.now() - startTime,
        error: 'Database service is currently unreachable',
      };
    }
  }
}
