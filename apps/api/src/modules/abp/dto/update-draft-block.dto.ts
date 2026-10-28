import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateDraftBlockDto {
  @ApiPropertyOptional({
    example: 'Updated Block Title',
    description: 'Updated human-readable title for the block instance',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    example: { url: 'https://cdn.ule.internal/updated.mp4' },
    description: 'Updated type-specific block configuration',
  })
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @ApiProperty({
    example: 2,
    description: 'Expected draft revision for optimistic concurrency control',
  })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedRevision!: number;
}
