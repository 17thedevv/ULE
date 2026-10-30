import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DraftQuestsController } from './draft-quests.controller';
import { DraftQuestsService } from './draft-quests.service';
import { EnrollmentService } from './enrollment.service';
import { LearnerQuestsController } from './learner-quests.controller';
import { QualificationService } from './qualification.service';
import { QuestEngineService } from './quest-engine.service';
import { QuestTemplatesRegistry } from './quest-templates.registry';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DraftQuestsController, LearnerQuestsController],
  providers: [
    QuestTemplatesRegistry,
    DraftQuestsService,
    EnrollmentService,
    QualificationService,
    QuestEngineService,
  ],
  exports: [
    QuestTemplatesRegistry,
    DraftQuestsService,
    EnrollmentService,
    QualificationService,
    QuestEngineService,
  ],
})
export class QuestsModule {}
