import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AddDraftBlockDto {
  @ApiProperty({
    example: 'video',
    description: 'Identifier of the registered ABP block type (e.g. video, multiple-choice, coding)',
  })
  @IsString()
  @IsNotEmpty()
  blockTypeId!: string;

  @ApiPropertyOptional({
    example: '1.0.0',
    description: 'Target schema version of the block type',
    default: '1.0.0',
  })
  @IsString()
  @IsOptional()
  typeVersion?: string;

  @ApiProperty({
    example: 'Introduction to Universal Learning Engine',
    description: 'Human-readable title for the block instance',
  })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({
    example: { url: 'https://cdn.ule.internal/intro.mp4', durationSeconds: 120 },
    description: 'Type-specific block configuration validated against the type schema',
  })
  @IsObject()
  config!: Record<string, unknown>;

  @ApiPropertyOptional({
    example: 0,
    description: 'Explicit order index (appended to end if omitted)',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  orderIndex?: number;

  @ApiProperty({
    example: 1,
    description: 'Expected draft revision for optimistic concurrency control',
  })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedRevision!: number;
}
