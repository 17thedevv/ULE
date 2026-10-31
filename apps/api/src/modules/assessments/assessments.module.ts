import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { QuestionTypesRegistry } from './questions/question-types.registry';
import { QuestionBankService } from './question-bank.service';
import { QuestionBankController } from './question-bank.controller';
import { AssessmentsService } from './assessments.service';
import { AssessmentsController } from './assessments.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [QuestionBankController, AssessmentsController],
  providers: [QuestionTypesRegistry, QuestionBankService, AssessmentsService],
  exports: [QuestionTypesRegistry, QuestionBankService, AssessmentsService],
})
export class AssessmentsModule {}
