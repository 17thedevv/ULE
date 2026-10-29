import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateAccessGrantDto {
  @ApiPropertyOptional({
    description: 'Target learner user ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Target learner email address',
    example: 'learner@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
