import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class StartExamAttemptRequestDto {
  @ApiPropertyOptional({
    description: 'Client idempotency key for safe retries without duplicating attempts',
    example: 'attempt-key-alice-midterm-1',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class SaveExamResponseRequestDto {
  @ApiProperty({
    description: 'Polymorphic learner response payload corresponding to the question type',
    example: { selectedOptionId: 'opt_1' },
  })
  @IsNotEmpty()
  @IsObject()
  responsePayload!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Optimistic concurrency revision check to prevent lost concurrent updates',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}

export class SubmitExamAttemptRequestDto {
  @ApiPropertyOptional({
    description: 'Client idempotency key for safe submission retries without double grading',
    example: 'submit-key-alice-midterm-1',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class GrantExamAccessRequestDto {
  @ApiProperty({
    description: 'Identifier of the learner granted access to this standalone examination',
    example: 'user_clx09123891823',
  })
  @IsNotEmpty()
  @IsString()
  userId!: string;
}
