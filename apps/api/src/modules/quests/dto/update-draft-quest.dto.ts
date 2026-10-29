import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  QuestObjectiveConfig,
  QuestRewardPolicyDto,
  UpdateDraftCourseQuestRequest,
} from '@ule/contracts';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateDraftQuestDto implements UpdateDraftCourseQuestRequest {
  @ApiProperty({
    description: 'Expected current draft revision for optimistic locking',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  expectedRevision!: number;

  @ApiPropertyOptional({
    description: 'Human-readable title of the course quest',
    example: 'Updated Quest Title',
  })
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(128)
  title?: string;

  @ApiPropertyOptional({
    description: 'Optional description of the quest goal',
    example: 'Updated quest description',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Template-specific objective configuration',
    example: { targetCount: 3 },
  })
  @IsObject()
  @IsOptional()
  config?: QuestObjectiveConfig;

  @ApiPropertyOptional({
    description: 'Course-scoped reward policy',
    example: { courseXp: 100 },
  })
  @IsObject()
  @IsOptional()
  rewardPolicy?: QuestRewardPolicyDto;
}
