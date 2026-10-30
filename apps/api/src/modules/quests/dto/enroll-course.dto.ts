import { ApiPropertyOptional } from '@nestjs/swagger';
import { EnrollCourseRequest } from '@ule/contracts';
import { IsOptional, IsString } from 'class-validator';

export class EnrollCourseDto implements EnrollCourseRequest {
  @ApiPropertyOptional({
    description: 'Optional idempotency key for enrollment deduplication',
    example: 'enroll-req-12345',
  })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
