import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCourseSkillDto {
  @ApiProperty({
    description: 'Course-scoped unique identifier code for the skill',
    example: 'algebra-linear-eq',
  })
  @IsNotEmpty()
  @IsString()
  skillCode!: string;

  @ApiProperty({
    description: 'Human-readable name of the skill',
    example: 'Linear Equations Solving',
  })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: 'Observable learning objective description for this skill',
    example: 'Learner can solve single-variable linear equations with integer coefficients.',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
