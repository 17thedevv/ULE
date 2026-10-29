import { Module } from '@nestjs/common';
import { AbpModule } from '../abp/abp.module';
import { AuthModule } from '../auth/auth.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LearnerController } from './learner.controller';
import { LearnerService } from './learner.service';

@Module({
  imports: [PrismaModule, AuthModule, EvidenceModule, AbpModule],
  controllers: [LearnerController],
  providers: [LearnerService],
  exports: [LearnerService],
})
export class LearnerModule {}
