import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class AssessmentCorrectionDto {
  @ApiProperty({
    description: 'Target AssessmentResult ID to correct',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  assessmentResultId!: string;

  @ApiPropertyOptional({
    description: 'New assessment status',
    enum: ['EVALUATED', 'SKIPPED', 'FAILED', 'PENDING'],
    example: 'EVALUATED',
  })
  @IsOptional()
  @IsEnum(['EVALUATED', 'SKIPPED', 'FAILED', 'PENDING'])
  newStatus?: 'EVALUATED' | 'SKIPPED' | 'FAILED' | 'PENDING';

  @ApiPropertyOptional({
    description: 'Corrected correctness flag',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  newIsCorrect?: boolean;

  @ApiPropertyOptional({
    description: 'Corrected numerical score',
    example: 1.0,
  })
  @IsOptional()
  @IsNumber()
  newScore?: number;

  @ApiProperty({
    description: 'Auditable explanation for why the correction is being made',
    example: 'Regraded following authorized rubric clarification on answer key ambiguity.',
  })
  @IsNotEmpty()
  @IsString()
  reason!: string;
}
