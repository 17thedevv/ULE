import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuestsModule } from '../quests/quests.module';
import { AssessmentCorrectionController } from './assessment-correction.controller';
import { AssessmentCorrectionService } from './assessment-correction.service';
import { EvidenceIntakeService } from './evidence-intake.service';
import { LearnerSkillProjectionService } from './learner-skill-projection.service';

@Module({
  imports: [PrismaModule, AuthModule, QuestsModule],
  controllers: [AssessmentCorrectionController],
  providers: [
    EvidenceIntakeService,
    LearnerSkillProjectionService,
    AssessmentCorrectionService,
  ],
  exports: [
    EvidenceIntakeService,
    LearnerSkillProjectionService,
    AssessmentCorrectionService,
  ],
})
export class EvidenceModule {}
