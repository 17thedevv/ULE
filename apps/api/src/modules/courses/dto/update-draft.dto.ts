import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Optional expected revision number for optimistic concurrency control.',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  expectedRevision?: number;
}
