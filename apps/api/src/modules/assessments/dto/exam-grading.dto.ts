import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RubricCriterionEvaluationDto {
  @ApiProperty({
    description: 'Unique identifier of the criterion defined in the published EssayRubric',
    example: 'crit_reasoning_1',
  })
  @IsString()
  @IsNotEmpty()
  criterionId!: string;

  @ApiProperty({
    description: 'Points awarded for this criterion (must not exceed criterion maxPoints)',
    example: 4.5,
  })
  @IsNumber()
  @Min(0)
  score!: number;

  @ApiPropertyOptional({
    description: 'Optional criterion-specific feedback from educator',
    example: 'Well structured logical argument with supporting evidence.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class EvaluateExamItemRequestDto {
  @ApiPropertyOptional({
    description: 'Array of criterion evaluations matching the published QuestionVersion EssayRubric',
    type: [RubricCriterionEvaluationDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionEvaluationDto)
  criterionScores?: RubricCriterionEvaluationDto[];

  @ApiPropertyOptional({
    description: 'Direct points awarded for questions evaluated without multi-criteria rubrics (e.g. SHORT_TEXT)',
    example: 5.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  awardedPoints?: number;

  @ApiPropertyOptional({
    description: 'General educator feedback and commentary',
    example: 'Excellent response addressing all prompt requirements.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;

  @ApiPropertyOptional({
    description: 'Client idempotency key for safe evaluation retries without duplicating revisions',
    example: 'eval-key-attempt-item-1',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Optimistic concurrency revision check on ExamItemGrade',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}

export class CorrectExamItemGradeRequestDto {
  @ApiPropertyOptional({
    description: 'Corrected array of criterion evaluations',
    type: [RubricCriterionEvaluationDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionEvaluationDto)
  criterionScores?: RubricCriterionEvaluationDto[];

  @ApiPropertyOptional({
    description: 'Corrected direct points awarded',
    example: 4.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  awardedPoints?: number;

  @ApiProperty({
    description: 'Mandatory reason for correcting a previously finalized grade',
    example: 'Clerical error in rubric criterion summation detected upon educator review',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({
    description: 'Updated general feedback',
    example: 'Adjusted reasoning score from 3 to 4 following manual verification.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;

  @ApiPropertyOptional({
    description: 'Client idempotency key for safe correction retries',
    example: 'correct-key-attempt-item-1',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiProperty({
    description: 'Mandatory optimistic concurrency check matching current ExamItemGrade revision',
    example: 1,
  })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class FinalizeExamGradingRequestDto {
  @ApiPropertyOptional({
    description: 'Client idempotency key for safe finalization retries',
    example: 'finalize-key-attempt-1',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class CreateExamAppealRequestDto {
  @ApiPropertyOptional({
    description: 'Optional specific ExamItemGrade identifier being appealed (omit for overall exam appeal)',
    example: 'c1b4b1a2-1111-2222-3333-444455556666',
  })
  @IsOptional()
  @IsUUID()
  examItemGradeId?: string;

  @ApiProperty({
    description: 'Learner explanation and justification for grade appeal',
    example: 'My essay cited historical sources meeting rubric clarity standards not initially credited.',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}

export class ResolveExamAppealRequestDto {
  @ApiProperty({
    description: 'Reviewer final determination on the appeal',
    enum: ['RESOLVED_UPHELD', 'RESOLVED_CHANGED', 'REJECTED'],
    example: 'RESOLVED_CHANGED',
  })
  @IsEnum(['RESOLVED_UPHELD', 'RESOLVED_CHANGED', 'REJECTED'])
  resolution!: 'RESOLVED_UPHELD' | 'RESOLVED_CHANGED' | 'REJECTED';

  @ApiProperty({
    description: 'Mandatory reasoned notes explaining the resolution determination',
    example: 'Re-reviewed essay argument; source citations verified. Criterion clarity updated.',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reviewerNotes!: string;

  @ApiPropertyOptional({
    description: 'Corrected direct points awarded (if resolution is RESOLVED_CHANGED)',
    example: 8.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  awardedPoints?: number;

  @ApiPropertyOptional({
    description: 'Corrected rubric criterion evaluations (if resolution is RESOLVED_CHANGED)',
    type: [RubricCriterionEvaluationDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionEvaluationDto)
  criterionScores?: RubricCriterionEvaluationDto[];

  @ApiPropertyOptional({
    description: 'Optional correction audit reason string',
    example: 'Appeal upheld upon reviewer inspection of citations',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  correctionReason?: string;

  @ApiPropertyOptional({
    description: 'Client idempotency key for safe resolution retry',
    example: 'resolve-appeal-1',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
