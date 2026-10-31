import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  AddAssessmentItemDto,
  CreateAssessmentDefinitionDto,
  CreateAssessmentSectionDto,
  ExamFeedbackPolicy,
  PublishAssessmentDto,
  UpdateAssessmentDefinitionDto,
  UpdateAssessmentItemDto,
  UpdateAssessmentSectionDto,
} from '@ule/contracts';

const VALID_FEEDBACK_POLICIES: ExamFeedbackPolicy[] = [
  'IMMEDIATE',
  'ON_SUBMISSION',
  'DEFERRED',
  'MANUAL',
];

export class CreateAssessmentDefinitionApiDto implements CreateAssessmentDefinitionDto {
  @ApiProperty({
    description: 'Assessment title (e.g. Midterm Examination)',
    example: 'Midterm Examination: Linear Systems & Algebra',
  })
  @IsString()
  @Length(3, 255)
  title!: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the assessment scope and objectives',
  })
  @IsString()
  @Length(0, 5000)
  @IsOptional()
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Learner-facing instructions displayed before starting',
    example: 'You have 60 minutes. Calculators are allowed for Section 2 only.',
  })
  @IsString()
  @Length(0, 5000)
  @IsOptional()
  instructions?: string | null;

  @ApiPropertyOptional({
    description: 'Optional time limit in minutes (null for untimed)',
    example: 60,
  })
  @IsInt()
  @Min(1)
  @Max(1440)
  @IsOptional()
  durationMinutes?: number | null;

  @ApiPropertyOptional({
    description: 'Passing score threshold (e.g. 70.0)',
    example: 70.0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  passingScore?: number | null;

  @ApiPropertyOptional({
    description: 'Maximum allowable learner attempts (null for unlimited)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxAttempts?: number | null;

  @ApiPropertyOptional({
    enum: VALID_FEEDBACK_POLICIES,
    default: 'ON_SUBMISSION',
    description: 'Feedback release timing policy',
  })
  @IsEnum(VALID_FEEDBACK_POLICIES)
  @IsOptional()
  feedbackPolicy?: ExamFeedbackPolicy;

  @ApiPropertyOptional({
    description: 'Optional Course ID linking this assessment to a specific Course',
  })
  @IsString()
  @IsOptional()
  courseId?: string | null;
}

export class UpdateAssessmentDefinitionApiDto implements UpdateAssessmentDefinitionDto {
  @ApiProperty({
    description: 'Expected draft revision for optimistic concurrency',
    example: 1,
  })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiPropertyOptional({ description: 'Updated assessment title' })
  @IsString()
  @Length(3, 255)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Updated description' })
  @IsString()
  @Length(0, 5000)
  @IsOptional()
  description?: string | null;

  @ApiPropertyOptional({ description: 'Updated instructions' })
  @IsString()
  @Length(0, 5000)
  @IsOptional()
  instructions?: string | null;

  @ApiPropertyOptional({ description: 'Updated duration in minutes' })
  @IsInt()
  @Min(1)
  @Max(1440)
  @IsOptional()
  durationMinutes?: number | null;

  @ApiPropertyOptional({ description: 'Updated passing score' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  passingScore?: number | null;

  @ApiPropertyOptional({ description: 'Updated max attempts' })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxAttempts?: number | null;

  @ApiPropertyOptional({ enum: VALID_FEEDBACK_POLICIES })
  @IsEnum(VALID_FEEDBACK_POLICIES)
  @IsOptional()
  feedbackPolicy?: ExamFeedbackPolicy;

  @ApiPropertyOptional({ description: 'Updated Course ID linkage' })
  @IsString()
  @IsOptional()
  courseId?: string | null;
}

export class CreateAssessmentSectionApiDto implements CreateAssessmentSectionDto {
  @ApiProperty({
    description: 'Section title (e.g. Section 1: Multiple Choice)',
    example: 'Section 1: Core Fundamentals',
  })
  @IsString()
  @Length(1, 255)
  title!: string;

  @ApiPropertyOptional({
    description: 'Section specific instructions or notes',
  })
  @IsString()
  @Length(0, 2000)
  @IsOptional()
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Display order index among sections',
    default: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  orderIndex?: number;
}

export class UpdateAssessmentSectionApiDto implements UpdateAssessmentSectionDto {
  @ApiPropertyOptional({ description: 'Updated section title' })
  @IsString()
  @Length(1, 255)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Updated description' })
  @IsString()
  @Length(0, 2000)
  @IsOptional()
  description?: string | null;

  @ApiPropertyOptional({ description: 'Updated order index' })
  @IsInt()
  @Min(0)
  @IsOptional()
  orderIndex?: number;
}

export class AddAssessmentItemApiDto implements AddAssessmentItemDto {
  @ApiProperty({
    description: 'ID of the reusable QuestionBankItem to add to this section',
  })
  @IsString()
  questionBankItemId!: string;

  @ApiPropertyOptional({
    description:
      'Optional specific QuestionVersion ID to pin. If omitted, pins the latest published version at publication time.',
  })
  @IsString()
  @IsOptional()
  pinnedQuestionVersionId?: string | null;

  @ApiPropertyOptional({
    description: 'Point weight for this item in this assessment (defaults to question defaultPoints)',
    example: 5.0,
  })
  @IsNumber()
  @Min(0.1)
  @IsOptional()
  points?: number;

  @ApiPropertyOptional({
    description: 'Item display order index within the section',
    default: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  orderIndex?: number;

  @ApiPropertyOptional({
    description: 'Whether answering this question is required to submit the exam',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;
}

export class UpdateAssessmentItemApiDto implements UpdateAssessmentItemDto {
  @ApiPropertyOptional({
    description: 'Updated pinned QuestionVersion ID',
  })
  @IsString()
  @IsOptional()
  pinnedQuestionVersionId?: string | null;

  @ApiPropertyOptional({
    description: 'Updated point weight for this item',
  })
  @IsNumber()
  @Min(0.1)
  @IsOptional()
  points?: number;

  @ApiPropertyOptional({
    description: 'Updated order index within section',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  orderIndex?: number;

  @ApiPropertyOptional({
    description: 'Updated isRequired flag',
  })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;
}

export class PublishAssessmentApiDto implements PublishAssessmentDto {
  @ApiPropertyOptional({
    description: 'Client idempotency key to prevent duplicate snapshot creation',
  })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
