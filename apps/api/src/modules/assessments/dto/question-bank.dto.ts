import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import {
  CreateQuestionBankItemDto,
  EssayRubric,
  QuestionType,
  UpdateQuestionBankItemDto,
} from '@ule/contracts';

const VALID_QUESTION_TYPES: QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'CLOZE',
  'SHORT_TEXT',
  'NUMERIC',
  'ESSAY',
  'MATCHING',
  'ORDERING',
];

export class CreateQuestionBankItemApiDto implements CreateQuestionBankItemDto {
  @ApiProperty({
    enum: VALID_QUESTION_TYPES,
    description: 'Allowlisted question type',
    example: 'SINGLE_CHOICE',
  })
  @IsEnum(VALID_QUESTION_TYPES, {
    message: `type must be one of: ${VALID_QUESTION_TYPES.join(', ')}`,
  })
  type!: QuestionType;

  @ApiProperty({
    description: 'Internal descriptive title for educator reference',
    example: 'Linear Equations Derivation Problem 1',
  })
  @IsString()
  @Length(2, 255)
  title!: string;

  @ApiProperty({
    description: 'Learner-facing question prompt or instruction',
    example: 'Solve for x: 2x + 5 = 15.',
  })
  @IsString()
  @Length(1, 10000)
  prompt!: string;

  @ApiProperty({
    description: 'Type-specific public content (options, blank templates, etc.)',
    example: {
      options: [
        { id: 'opt_1', text: 'x = 5' },
        { id: 'opt_2', text: 'x = 10' },
      ],
    },
  })
  @IsObject()
  content!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Type-specific protected secret answer key (stripped from learner payloads)',
    example: { correctOptionId: 'opt_1' },
  })
  @IsObject()
  @IsOptional()
  answerKey?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'Scoring rubric for human-graded open responses',
  })
  @IsObject()
  @IsOptional()
  rubric?: EssayRubric | null;

  @ApiPropertyOptional({
    description: 'Optional evaluator configuration (shuffling, tolerance overrides, etc.)',
  })
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'Default point value for this question when added to assessments',
    default: 1.0,
    example: 2.0,
  })
  @IsNumber()
  @Min(0.1)
  @IsOptional()
  defaultPoints?: number;

  @ApiPropertyOptional({
    description: 'Optional pedagogical skill code linked to this question item',
    example: 'SKILL_MATH_ALGEBRA',
  })
  @IsString()
  @IsOptional()
  skillCode?: string | null;

  @ApiPropertyOptional({
    description: 'Difficulty indicator (e.g. EASY, MEDIUM, HARD)',
    example: 'MEDIUM',
  })
  @IsString()
  @IsOptional()
  difficulty?: string | null;

  @ApiPropertyOptional({
    description: 'Classification tags for question bank organization',
    example: ['algebra', 'linear-equations', 'midterm-pool'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Optional course ID scoping this question item to a specific Course',
  })
  @IsString()
  @IsOptional()
  courseId?: string | null;
}

export class UpdateQuestionBankItemApiDto implements UpdateQuestionBankItemDto {
  @ApiProperty({
    description: 'Expected draft revision for optimistic concurrency control',
    example: 1,
  })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiPropertyOptional({
    description: 'Updated internal title',
  })
  @IsString()
  @Length(2, 255)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated learner prompt',
  })
  @IsString()
  @Length(1, 10000)
  @IsOptional()
  prompt?: string;

  @ApiPropertyOptional({
    description: 'Updated type-specific content',
  })
  @IsObject()
  @IsOptional()
  content?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Updated protected answer key',
  })
  @IsObject()
  @IsOptional()
  answerKey?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'Updated scoring rubric',
  })
  @IsObject()
  @IsOptional()
  rubric?: EssayRubric | null;

  @ApiPropertyOptional({
    description: 'Updated evaluator config',
  })
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'Updated default points',
  })
  @IsNumber()
  @Min(0.1)
  @IsOptional()
  defaultPoints?: number;

  @ApiPropertyOptional({
    description: 'Updated skill code',
  })
  @IsString()
  @IsOptional()
  skillCode?: string | null;

  @ApiPropertyOptional({
    description: 'Updated difficulty',
  })
  @IsString()
  @IsOptional()
  difficulty?: string | null;

  @ApiPropertyOptional({
    description: 'Updated tags',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Updated course ID linkage',
  })
  @IsString()
  @IsOptional()
  courseId?: string | null;
}

export class QuestionBankQueryDto {
  @ApiPropertyOptional({ enum: VALID_QUESTION_TYPES })
  @IsEnum(VALID_QUESTION_TYPES)
  @IsOptional()
  type?: QuestionType;

  @ApiPropertyOptional({ description: 'Filter by linked Course ID' })
  @IsString()
  @IsOptional()
  courseId?: string;

  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional({ description: 'Filter by linked Skill Code' })
  @IsString()
  @IsOptional()
  skillCode?: string;

  @ApiPropertyOptional({ description: 'Text search in title or prompt' })
  @IsString()
  @IsOptional()
  search?: string;
}
