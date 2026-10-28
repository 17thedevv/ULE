import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateCourseDto {
  @ApiProperty({
    description: 'Course title (min 3 characters)',
    example: 'Introduction to Calculus',
  })
  @IsString()
  @Length(3, 200, { message: 'Title must be between 3 and 200 characters.' })
  title!: string;

  @ApiPropertyOptional({
    description: 'Optional high-level description of the course',
    example:
      'Foundational calculus covering limits, derivatives, and integrals.',
  })
  @IsString()
  @IsOptional()
  @Length(0, 2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Optional short summary for learner discovery cards',
    example: 'Learn the essentials of calculus step-by-step.',
  })
  @IsString()
  @IsOptional()
  @Length(0, 500)
  summary?: string;
}
