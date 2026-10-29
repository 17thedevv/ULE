import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CoursesModule } from '../courses/courses.module';
import { AbpModule } from '../abp/abp.module';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    CoursesModule,
    AbpModule,
  ],
  controllers: [McpController],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
