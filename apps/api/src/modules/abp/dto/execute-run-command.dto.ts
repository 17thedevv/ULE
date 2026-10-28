import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ExecuteRunCommandRequest, RunCommandType } from '@ule/contracts';

const VALID_COMMANDS: RunCommandType[] = [
  'START',
  'SUSPEND',
  'RESUME',
  'SUBMIT_RESPONSE',
  'REQUEST_HINT',
  'FINISH',
  'ABANDON',
];

export class ExecuteRunCommandDto implements ExecuteRunCommandRequest {
  @ApiProperty({
    example: 'SUBMIT_RESPONSE',
    enum: VALID_COMMANDS,
    description: 'Host command to execute on the runtime instance',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(VALID_COMMANDS)
  command!: RunCommandType;

  @ApiPropertyOptional({
    example: { selectedOptionId: 'opt_1', usedHint: false },
    description: 'Payload for the command (e.g. response submission)',
  })
  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;

  @ApiProperty({
    example: 'req_idemp_cmd_456',
    description: 'Client idempotency key to prevent duplicate command processing',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}
