import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ExamGradeAppealDto,
  ExamGradingQueueItemDto,
  ExamItemGradeDto,
} from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CorrectExamItemGradeRequestDto,
  CreateExamAppealRequestDto,
  EvaluateExamItemRequestDto,
  FinalizeExamGradingRequestDto,
  ResolveExamAppealRequestDto,
} from './dto/exam-grading.dto';
import { ExamGradingService } from './exam-grading.service';

@ApiTags('Examinations & Human Rubric Grading')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard)
export class ExamGradingController {
  constructor(private readonly examGradingService: ExamGradingService) {}

  @Get('exam-grading/queue')
  @ApiOperation({
    summary: 'List examination attempts pending human rubric evaluation',
    description:
      'Returns pending examination attempts containing subjective open responses (ESSAY, SHORT_TEXT) awaiting educator scoring, scoped to assessments owned by the authenticated creator.',
  })
  @ApiQuery({
    name: 'assessmentDefinitionId',
    required: false,
    description: 'Optional filter by specific AssessmentDefinition ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Pending grading queue returned successfully.',
  })
  async getGradingQueue(
    @CurrentUser() user: AuthUser,
    @Query('assessmentDefinitionId') assessmentDefinitionId?: string,
  ): Promise<ExamGradingQueueItemDto[]> {
    return this.examGradingService.getGradingQueue(user.id, assessmentDefinitionId);
  }

  @Get('exam-grading/attempts/:attemptId')
  @ApiOperation({
    summary: 'Get full grading context for an examination attempt',
    description:
      'Fetches the complete examination submission, learner responses, frozen rubrics, and existing item evaluations for educator grading.',
  })
  @ApiParam({ name: 'attemptId', description: 'UUID of the ExamAttempt' })
  @ApiResponse({
    status: 200,
    description: 'Grading context retrieved successfully.',
  })
  async getGradingAttempt(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
  ) {
    return this.examGradingService.getGradingAttempt(user.id, attemptId);
  }

  @Post('exam-grading/items/:itemGradeId/evaluations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit an authoritative human rubric evaluation for an exam item',
    description:
      'Evaluates an ESSAY using published rubric criteria or awards bounded points for SHORT_TEXT. Appends an immutable revision and re-evaluates attempt finalization.',
  })
  @ApiParam({ name: 'itemGradeId', description: 'UUID of the ExamItemGrade' })
  @ApiResponse({
    status: 200,
    description: 'Item evaluated successfully and revision logged.',
  })
  async evaluateItem(
    @CurrentUser() user: AuthUser,
    @Param('itemGradeId') itemGradeId: string,
    @Body() dto: EvaluateExamItemRequestDto,
  ): Promise<ExamItemGradeDto> {
    return this.examGradingService.evaluateItem(user.id, itemGradeId, dto);
  }

  @Post('exam-grading/items/:itemGradeId/corrections')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Issue an authorized correction to a previously graded exam item',
    description:
      'Corrects an evaluation score with mandatory reason, verifies optimistic expectedRevision, and atomically recalculates the authoritative aggregate score.',
  })
  @ApiParam({ name: 'itemGradeId', description: 'UUID of the ExamItemGrade' })
  @ApiResponse({
    status: 200,
    description: 'Item grade corrected and revision appended.',
  })
  async correctItemGrade(
    @CurrentUser() user: AuthUser,
    @Param('itemGradeId') itemGradeId: string,
    @Body() dto: CorrectExamItemGradeRequestDto,
  ): Promise<ExamItemGradeDto> {
    return this.examGradingService.correctItemGrade(user.id, itemGradeId, dto);
  }

  @Post('exam-grading/attempts/:attemptId/finalize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Explicitly finalize human grading for an examination attempt',
    description:
      'Transitions attempt from GRADING to COMPLETED, aggregates objective and human scores, recomputes pass/fail status, and applies feedback release policies.',
  })
  @ApiParam({ name: 'attemptId', description: 'UUID of the ExamAttempt' })
  @ApiResponse({
    status: 200,
    description: 'Exam attempt finalized successfully.',
  })
  async finalizeGrading(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
    @Body() dto: FinalizeExamGradingRequestDto,
  ) {
    return this.examGradingService.finalizeGrading(user.id, attemptId, dto);
  }

  @Get('exam-grading/attempts/:attemptId/revisions')
  @ApiOperation({
    summary: 'Retrieve append-only revision ledger for an examination attempt',
    description:
      'Returns the full ordered history of aggregate grade revisions and individual item human evaluations/corrections.',
  })
  @ApiParam({ name: 'attemptId', description: 'UUID of the ExamAttempt' })
  @ApiResponse({
    status: 200,
    description: 'Revision ledger returned successfully.',
  })
  async getGradeRevisions(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
  ) {
    return this.examGradingService.getGradeRevisions(user.id, attemptId);
  }

  // ===========================================================================
  // Appeals Endpoints
  // ===========================================================================

  @Post('exam-attempts/:attemptId/appeals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a grade appeal for a completed, released examination',
    description:
      'Learner requests an appeal on overall result or a specific item with mandatory reason. Duplicate active appeals are rejected with HTTP 409.',
  })
  @ApiParam({ name: 'attemptId', description: 'UUID of the ExamAttempt' })
  @ApiResponse({
    status: 201,
    description: 'Appeal registered successfully in OPEN status.',
  })
  async createAppeal(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
    @Body() dto: CreateExamAppealRequestDto,
  ): Promise<ExamGradeAppealDto> {
    return this.examGradingService.createAppeal(user.id, attemptId, dto);
  }

  @Get('exam-attempts/:attemptId/appeals')
  @ApiOperation({
    summary: 'List appeals filed for an examination attempt',
    description:
      'Returns appeals associated with the attempt. Accessible only to the taking learner or the assessment creator.',
  })
  @ApiParam({ name: 'attemptId', description: 'UUID of the ExamAttempt' })
  @ApiResponse({
    status: 200,
    description: 'List of appeals returned successfully.',
  })
  async getAppealsForAttempt(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
  ): Promise<ExamGradeAppealDto[]> {
    return this.examGradingService.getAppealsForAttempt(user.id, attemptId);
  }

  @Get('exam-appeals/:appealId')
  @ApiOperation({
    summary: 'Get details of a specific grade appeal',
    description:
      'Fetches status, reason, reviewer notes, and resolution outcome for an appeal.',
  })
  @ApiParam({ name: 'appealId', description: 'UUID of the ExamGradeAppeal' })
  @ApiResponse({
    status: 200,
    description: 'Appeal details retrieved successfully.',
  })
  async getAppeal(
    @CurrentUser() user: AuthUser,
    @Param('appealId') appealId: string,
  ): Promise<ExamGradeAppealDto> {
    return this.examGradingService.getAppeal(user.id, appealId);
  }

  @Post('exam-appeals/:appealId/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Acknowledge and accept an appeal into review',
    description:
      'Authorized creator transitions an appeal from OPEN to UNDER_REVIEW.',
  })
  @ApiParam({ name: 'appealId', description: 'UUID of the ExamGradeAppeal' })
  @ApiResponse({
    status: 200,
    description: 'Appeal status transitioned to UNDER_REVIEW.',
  })
  async reviewAppeal(
    @CurrentUser() user: AuthUser,
    @Param('appealId') appealId: string,
  ): Promise<ExamGradeAppealDto> {
    return this.examGradingService.reviewAppeal(user.id, appealId);
  }

  @Post('exam-appeals/:appealId/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve an appeal with reasoned determination and optional score adjustment',
    description:
      'Resolves appeal as RESOLVED_UPHELD, REJECTED, or RESOLVED_CHANGED. If changed, an authoritative grade correction and audit entry are atomically created.',
  })
  @ApiParam({ name: 'appealId', description: 'UUID of the ExamGradeAppeal' })
  @ApiResponse({
    status: 200,
    description: 'Appeal resolved successfully.',
  })
  async resolveAppeal(
    @CurrentUser() user: AuthUser,
    @Param('appealId') appealId: string,
    @Body() dto: ResolveExamAppealRequestDto,
  ): Promise<ExamGradeAppealDto> {
    return this.examGradingService.resolveAppeal(user.id, appealId, dto);
  }
}
