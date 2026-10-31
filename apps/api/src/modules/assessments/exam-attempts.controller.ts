import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ExamAccessGrantDto,
  ExamAttemptDto,
  ExamResponseDto,
  ExamResultSummaryDto,
} from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  GrantExamAccessRequestDto,
  SaveExamResponseRequestDto,
  StartExamAttemptRequestDto,
  SubmitExamAttemptRequestDto,
} from './dto/exam-attempt.dto';
import {
  ExamAttemptQuestionsDto,
  ExamAttemptsService,
} from './exam-attempts.service';

@ApiTags('Examinations & Attempt Runtime')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard)
export class ExamAttemptsController {
  constructor(private readonly examAttemptsService: ExamAttemptsService) {}

  @Post('exams/:assessmentVersionId/attempts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start or resume an examination attempt for a learner',
    description:
      'Creates a new attempt against an immutable AssessmentVersion blueprint or returns existing attempt if idempotent key matches. Server-authoritative timing applies.',
  })
  @ApiParam({
    name: 'assessmentVersionId',
    description: 'UUID of the published AssessmentVersion',
  })
  @ApiResponse({
    status: 201,
    description: 'Attempt initiated successfully.',
  })
  async startAttempt(
    @CurrentUser() user: AuthUser,
    @Param('assessmentVersionId') assessmentVersionId: string,
    @Body() dto: StartExamAttemptRequestDto,
  ): Promise<ExamAttemptDto> {
    return this.examAttemptsService.startAttempt(assessmentVersionId, user.id, dto);
  }

  @Get('exam-attempts/:attemptId')
  @ApiOperation({
    summary: 'Get examination attempt session metadata',
    description:
      'Retrieves attempt status, server deadlines, and initiates lazy expiration if past deadline.',
  })
  @ApiParam({
    name: 'attemptId',
    description: 'UUID of the ExamAttempt',
  })
  async getAttempt(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
  ): Promise<ExamAttemptDto> {
    return this.examAttemptsService.getAttempt(attemptId, user.id);
  }

  @Get('exam-attempts/:attemptId/questions')
  @ApiOperation({
    summary: 'Get sanitized examination questions for active attempt',
    description:
      'Returns questions from the frozen AssessmentVersion snapshot stripped of all answer keys, rubrics, and educator solutions.',
  })
  @ApiParam({
    name: 'attemptId',
    description: 'UUID of the ExamAttempt',
  })
  async getQuestions(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
  ): Promise<ExamAttemptQuestionsDto> {
    return this.examAttemptsService.getQuestions(attemptId, user.id);
  }

  @Get('exam-attempts/:attemptId/responses')
  @ApiOperation({
    summary: 'Get saved responses for the attempt',
    description: 'Returns learner responses saved so far.',
  })
  @ApiParam({
    name: 'attemptId',
    description: 'UUID of the ExamAttempt',
  })
  async getResponses(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
  ): Promise<ExamResponseDto[]> {
    return this.examAttemptsService.getResponses(attemptId, user.id);
  }

  @Put('exam-attempts/:attemptId/responses/:itemId')
  @ApiOperation({
    summary: 'Save or autosave learner response for an individual question item',
    description:
      'Persists item response with optimistic revision checking (CAS). Rejects after exam deadline.',
  })
  @ApiParam({
    name: 'attemptId',
    description: 'UUID of the ExamAttempt',
  })
  @ApiParam({
    name: 'itemId',
    description: 'UUID of the assessment item reference in the published blueprint',
  })
  async saveResponse(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
    @Param('itemId') itemId: string,
    @Body() dto: SaveExamResponseRequestDto,
  ): Promise<ExamResponseDto> {
    return this.examAttemptsService.saveResponse(attemptId, itemId, user.id, dto);
  }

  @Post('exam-attempts/:attemptId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finalize and submit examination attempt for grading',
    description:
      'Freezes responses, runs deterministic auto-grading for objective items, queues subjective items for human review, and applies feedback release policies.',
  })
  @ApiParam({
    name: 'attemptId',
    description: 'UUID of the ExamAttempt',
  })
  async submitAttempt(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitExamAttemptRequestDto,
  ): Promise<ExamResultSummaryDto> {
    return this.examAttemptsService.submitAttempt(attemptId, user.id, dto);
  }

  @Get('exam-attempts/:attemptId/result')
  @ApiOperation({
    summary: 'Get final examination results and grade breakdown',
    description:
      'Returns released score and feedback. If policy is DEFERRED or MANUAL and not released, sensitive scores and answer keys are withheld.',
  })
  @ApiParam({
    name: 'attemptId',
    description: 'UUID of the ExamAttempt',
  })
  async getResult(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
  ): Promise<ExamResultSummaryDto> {
    return this.examAttemptsService.getResult(attemptId, user.id);
  }

  @Post('exam-attempts/:attemptId/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Explicitly release examination grades for an attempt',
    description:
      'Allows assessment creator to release results for MANUAL release policy.',
  })
  @ApiParam({
    name: 'attemptId',
    description: 'UUID of the ExamAttempt',
  })
  async releaseAttemptGrade(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
  ): Promise<ExamResultSummaryDto> {
    return this.examAttemptsService.releaseAttemptGrade(attemptId, user.id);
  }

  @Post('assessments/:assessmentId/access-grants')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Grant learner explicit access to a standalone assessment',
    description:
      'Enables creators to grant access to standalone exams without requiring course enrollment.',
  })
  @ApiParam({
    name: 'assessmentId',
    description: 'UUID of the AssessmentDefinition',
  })
  async grantAccess(
    @CurrentUser() user: AuthUser,
    @Param('assessmentId') assessmentId: string,
    @Body() dto: GrantExamAccessRequestDto,
  ): Promise<ExamAccessGrantDto> {
    return this.examAttemptsService.grantAccess(assessmentId, user.id, dto);
  }
}
