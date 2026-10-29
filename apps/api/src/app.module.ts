import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validate } from './config/validation';
import { AbpModule } from './modules/abp/abp.module';
import { AuthModule } from './modules/auth/auth.module';
import { CoursesModule } from './modules/courses/courses.module';
import { EvidenceModule } from './modules/evidence/evidence.module';
import { AccessGrantsModule } from './modules/grants/access-grants.module';
import { HealthModule } from './modules/health/health.module';
import { LearnerModule } from './modules/learner/learner.module';
import { McpModule } from './modules/mcp/mcp.module';
import { MeModule } from './modules/me/me.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { SkillsModule } from './modules/skills/skills.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    PrismaModule,
    AuthModule,
    MeModule,
    CoursesModule,
    SkillsModule,
    AccessGrantsModule,
    EvidenceModule,
    AbpModule,
    LearnerModule,
    McpModule,
    HealthModule,
  ],
})
export class AppModule {}

