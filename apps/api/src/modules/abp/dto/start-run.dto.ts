import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { StartRunRequest } from '@ule/contracts';

export class StartRunDto implements StartRunRequest {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Immutable CourseVersion ID to pin the runtime execution against',
  })
  @IsUUID()
  @IsNotEmpty()
  courseVersionId!: string;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'ID of the specific activity block instance inside the version snapshot',
  })
  @IsString()
  @IsNotEmpty()
  blockInstanceId!: string;

  @ApiProperty({
    example: 'req_idemp_start_123',
    description: 'Client idempotency key to prevent duplicate run creation',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}
