import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ReorderDraftBlocksDto {
  @ApiProperty({
    example: ['block-id-1', 'block-id-2'],
    description: 'Complete list of draft block IDs ordered by intended display sequence',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  blockIds!: string[];

  @ApiPropertyOptional({
    example: 3,
    description: 'Expected draft revision for optimistic concurrency control',
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  expectedRevision?: number;
}
