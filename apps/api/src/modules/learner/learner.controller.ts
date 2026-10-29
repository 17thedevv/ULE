import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CourseProgressDto,
  LearnerCourseVersionDto,
  LearnerSkillProjectionDto,
  LearningEvidenceDto,
} from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { LearnerService } from './learner.service';

@ApiTags('Learner')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('learner/courses')
export class LearnerController {
  constructor(private readonly learnerService: LearnerService) {}

  @Get()
  @ApiOperation({
    summary: 'List authorized CourseVersions',
    description: 'Lists all private immutable CourseVersions for which the authenticated learner has an active access grant or ownership.',
  })
  @ApiResponse({ status: 200, description: 'Courses retrieved successfully' })
  async listGrantedCourses(
    @CurrentUser() user: AuthUser,
  ): Promise<LearnerCourseVersionDto[]> {
    return this.learnerService.listGrantedCourses(user.id);
  }

  @Get(':versionId/progress')
  @ApiOperation({
    summary: 'Get activity block progress',
    description: 'Retrieves activity block completion progress. Invariant: progress is strictly non-mastery completion tracking.',
  })
  @ApiResponse({ status: 200, description: 'Progress retrieved successfully' })
  @ApiResponse({ status: 404, description: 'CourseVersion not found or unauthorized' })
  async getCourseProgress(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
  ): Promise<CourseProgressDto> {
    return this.learnerService.getCourseProgress(user.id, versionId);
  }

  @Get(':versionId/evidence')
  @ApiOperation({
    summary: 'Get trusted learning evidence summary',
    description: 'Retrieves the learner’s own accepted evidence ledger records, preserving deferred feedback redaction where applicable.',
  })
  @ApiResponse({ status: 200, description: 'Evidence summary retrieved successfully' })
  @ApiResponse({ status: 404, description: 'CourseVersion not found or unauthorized' })
  async getEvidenceSummary(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
  ): Promise<LearningEvidenceDto[]> {
    return this.learnerService.getEvidenceSummary(user.id, versionId);
  }

  @Get(':versionId/skills')
  @ApiOperation({
    summary: 'Get learner skill projections and action proposals',
    description: 'Retrieves transparent, conservative skill state projections (INSUFFICIENT_EVIDENCE, DEVELOPING, READY_TO_VERIFY) with plain-language reasons and explicit limitations.',
  })
  @ApiResponse({ status: 200, description: 'Skill projections retrieved successfully' })
  @ApiResponse({ status: 404, description: 'CourseVersion not found or unauthorized' })
  async getSkillProjections(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
  ): Promise<LearnerSkillProjectionDto[]> {
    return this.learnerService.getSkillProjections(user.id, versionId);
  }
}
