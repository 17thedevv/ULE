import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ABAttemptDto,
  ABEventDto,
  ABRunDto,
  AssessmentResultDto,
  AssessmentStatus,
  RunCloseReason,
  RunResultsDto,
  RunStatus,
} from '@ule/contracts';

export class ABAttemptResponseDto implements ABAttemptDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  runId!: string;

  @ApiProperty({ example: 1 })
  attemptNumber!: number;

  @ApiProperty({ example: { selectedOptionId: 'opt_1' } })
  submittedResponse!: Record<string, unknown>;

  @ApiProperty({ example: false })
  assisted!: boolean;

  @ApiPropertyOptional({ example: { hintUsed: false, assistanceLevel: 'NONE' } })
  supportContext!: Record<string, unknown> | null;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  createdAt!: string;
}

export class AssessmentResultResponseDto implements AssessmentResultDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  attemptId!: string | null;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  runId!: string;

  @ApiProperty({ example: 'EVALUATED' })
  status!: AssessmentStatus;

  @ApiPropertyOptional({ example: true })
  isCorrect!: boolean | null;

  @ApiPropertyOptional({ example: 1.0 })
  score!: number | null;

  @ApiPropertyOptional({ example: { isCorrect: true, explanation: 'Well done.' } })
  feedback!: Record<string, unknown> | string | null;

  @ApiProperty({ example: 'ule-mcq-deterministic-evaluator-v1' })
  evaluatorId!: string;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  evaluatedAt!: string;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  createdAt!: string;
}

export class ABEventResponseDto implements ABEventDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  runId!: string;

  @ApiProperty({ example: 'RUN_STARTED' })
  eventType!: string;

  @ApiPropertyOptional({ example: {} })
  payload!: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: 'idemp-123' })
  idempotencyKey!: string | null;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  serverTimestamp!: string;
}

export class ABRunResponseDto implements ABRunDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userId!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  courseVersionId!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  blockInstanceId!: string;

  @ApiProperty({ example: 'multiple-choice' })
  blockTypeId!: string;

  @ApiProperty({ example: '1.0.0' })
  typeVersion!: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['CREATED', 'ACTIVE', 'SUSPENDED', 'CLOSED'] })
  status!: RunStatus;

  @ApiPropertyOptional({ example: 'COMPLETED', enum: ['COMPLETED', 'ABANDONED', 'FAILED'] })
  closeReason!: RunCloseReason | null;

  @ApiPropertyOptional({ example: null })
  failureDetails!: string | null;

  @ApiPropertyOptional({ example: '2026-10-28T12:00:00.000Z' })
  startedAt!: string | null;

  @ApiPropertyOptional({ example: null })
  closedAt!: string | null;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  updatedAt!: string;

  @ApiProperty({
    description: 'Sanitized block configuration suitable for learner consumption (answer keys stripped)',
  })
  block!: {
    id: string;
    blockTypeId: string;
    typeVersion: string;
    title: string;
    orderIndex: number;
    learnerConfig: Record<string, unknown>;
  };

  @ApiPropertyOptional({ type: ABAttemptResponseDto })
  latestAttempt?: ABAttemptResponseDto | null;

  @ApiPropertyOptional({ type: AssessmentResultResponseDto })
  latestAssessment?: AssessmentResultResponseDto | null;
}

export class RunResultsResponseDto implements RunResultsDto {
  @ApiProperty({ type: ABRunResponseDto })
  run!: ABRunResponseDto;

  @ApiProperty({ type: [ABAttemptResponseDto] })
  attempts!: ABAttemptResponseDto[];

  @ApiProperty({ type: [AssessmentResultResponseDto] })
  assessments!: AssessmentResultResponseDto[];

  @ApiProperty({ type: [ABEventResponseDto] })
  events!: ABEventResponseDto[];
}
