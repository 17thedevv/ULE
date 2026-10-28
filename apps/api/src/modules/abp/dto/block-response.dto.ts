import { ApiProperty } from '@nestjs/swagger';
import {
  BlockValidationResultDto,
  DraftBlockInstanceDto,
  DraftValidationResponseDto,
} from '@ule/contracts';

export class DraftBlockInstanceResponseDto implements DraftBlockInstanceDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  draftId!: string;

  @ApiProperty({ example: 'multiple-choice' })
  blockTypeId!: string;

  @ApiProperty({ example: '1.0.0' })
  typeVersion!: string;

  @ApiProperty({ example: 'Module 1 Knowledge Check' })
  title!: string;

  @ApiProperty({ example: 0 })
  orderIndex!: number;

  @ApiProperty({ example: { question: 'What is ULE?' } })
  config!: Record<string, unknown>;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  updatedAt!: string;
}

export class BlockValidationResultResponseDto implements BlockValidationResultDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  blockId!: string;

  @ApiProperty({ example: 'Module 1 Knowledge Check' })
  title!: string;

  @ApiProperty({ example: 'multiple-choice' })
  blockTypeId!: string;

  @ApiProperty({ example: true })
  valid!: boolean;

  @ApiProperty({ example: [] })
  errors!: string[];
}

export class DraftValidationResponseDtoImpl implements DraftValidationResponseDto {
  @ApiProperty({ example: true })
  valid!: boolean;

  @ApiProperty({ example: 2 })
  totalBlocks!: number;

  @ApiProperty({ example: 0 })
  invalidBlocksCount!: number;

  @ApiProperty({ type: [BlockValidationResultResponseDto] })
  blocks!: BlockValidationResultResponseDto[];
}
