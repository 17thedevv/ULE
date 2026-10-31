import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { QuestionTypesRegistry } from './questions/question-types.registry';
import { QuestionBankService } from './question-bank.service';
import { QuestionBankController } from './question-bank.controller';
import { AssessmentsService } from './assessments.service';
import { AssessmentsController } from './assessments.controller';
import { DeterministicAutoGraderService } from './evaluators/deterministic-auto-grader.service';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamAttemptsController } from './exam-attempts.controller';
import { ExamGradingService } from './exam-grading.service';
import { ExamGradingController } from './exam-grading.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    QuestionBankController,
    AssessmentsController,
    ExamAttemptsController,
    ExamGradingController,
  ],
  providers: [
    QuestionTypesRegistry,
    QuestionBankService,
    AssessmentsService,
    DeterministicAutoGraderService,
    ExamAttemptsService,
    ExamGradingService,
  ],
  exports: [
    QuestionTypesRegistry,
    QuestionBankService,
    AssessmentsService,
    DeterministicAutoGraderService,
    ExamAttemptsService,
    ExamGradingService,
  ],
})
export class AssessmentsModule {}
