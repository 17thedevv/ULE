import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpsertDraftSkillMappingDto {
  @ApiProperty({
    description: 'Draft block instance ID to map to the skill',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  blockInstanceId!: string;

  @ApiProperty({
    description: 'Course-scoped skill ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  skillId!: string;

  @ApiPropertyOptional({
    description: 'Item or task variant key (e.g. question id or default)',
    example: 'default',
    default: 'default',
  })
  @IsOptional()
  @IsString()
  itemKey?: string;

  @ApiPropertyOptional({
    description: 'Observable evaluation criterion',
    example: 'CORRECT_RESPONSE',
    default: 'CORRECT_RESPONSE',
  })
  @IsOptional()
  @IsString()
  criterion?: string;

  @ApiPropertyOptional({
    description: 'Weight of this evidence observation for the mapped skill',
    example: 1.0,
    default: 1.0,
  })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiProperty({
    description: 'Expected current revision of the course draft for optimistic concurrency',
    example: 1,
  })
  @IsInt()
  expectedRevision!: number;
}
