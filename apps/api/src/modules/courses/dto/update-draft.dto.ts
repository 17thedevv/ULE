import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class UpdateCourseDraftDto {
  @ApiPropertyOptional({
    description: 'Updated draft title',
    example: 'Advanced Calculus and Applications',
  })
  @IsString()
  @IsOptional()
  @Length(3, 200, { message: 'Title must be between 3 and 200 characters.' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated course description',
    example:
      'In-depth exploration of differential and multivariable calculus.',
  })
  @IsString()
  @IsOptional()
  @Length(0, 2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated short summary',
    example: 'Comprehensive multivariable calculus course.',
  })
  @IsString()
  @IsOptional()
  @Length(0, 500)
  summary?: string;

  @ApiProperty({
    description:
      'Authoritative expected revision number for atomic optimistic concurrency control.',
    example: 1,
  })
  @IsDefined({
    message: 'expectedRevision is required for optimistic concurrency control.',
  })
  @IsNotEmpty({ message: 'expectedRevision must not be empty.' })
  @IsInt({ message: 'expectedRevision must be an integer.' })
  @Min(1, { message: 'expectedRevision must be at least 1.' })
  expectedRevision!: number;
}
