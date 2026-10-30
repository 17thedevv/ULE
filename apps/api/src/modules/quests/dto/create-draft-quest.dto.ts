import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CourseQuestRewardPolicyDto,
  CreateDraftCourseQuestRequest,
  QuestObjectiveConfig,
  QuestTemplateId,
} from '@ule/contracts';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDraftQuestDto implements CreateDraftCourseQuestRequest {
  @ApiProperty({
    description: 'Unique slug or identifier for the quest within the draft (alphanumeric and dashes)',
    example: 'complete-intro-activities',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'questKey must contain only lowercase alphanumeric characters, underscores, and hyphens.',
  })
  questKey!: string;

  @ApiProperty({
    description: 'Human-readable title of the course quest',
    example: 'Complete Getting Started Activities',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(128)
  title!: string;

  @ApiPropertyOptional({
    description: 'Optional description of the quest goal',
    example: 'Finish 2 foundational activities to complete this quest.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Allowlisted Quest Template ID',
    enum: ['COMPLETE_DISTINCT_ACTIVITIES', 'INDEPENDENT_PRACTICE'],
    example: 'COMPLETE_DISTINCT_ACTIVITIES',
  })
  @IsString()
  @IsNotEmpty()
  templateId!: QuestTemplateId;

  @ApiProperty({
    description: 'Template-specific objective configuration',
    example: { targetCount: 2 },
  })
  @IsObject()
  config!: QuestObjectiveConfig;

  @ApiPropertyOptional({
    description: 'Course-scoped reward policy (e.g. course XP, badgeKey)',
    example: { courseXp: 50 },
  })
  @IsObject()
  @IsOptional()
  rewardPolicy?: CourseQuestRewardPolicyDto;
}
