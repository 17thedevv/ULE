import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CourseEnrollmentDto,
  CourseQuestInstanceDto,
} from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { EnrollmentService } from './enrollment.service';

@ApiTags('Learner Quests & Enrollment')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('learner/courses/:versionId')
export class LearnerQuestsController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Post('enroll')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enroll authenticated learner into an authorized CourseVersion' })
  @ApiResponse({ status: 201, description: 'Enrolled successfully with initialized quest instances' })
  @ApiResponse({ status: 403, description: 'Access grant revoked or unauthorized' })
  @ApiResponse({ status: 404, description: 'CourseVersion not found' })
  async enroll(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ enrollment: CourseEnrollmentDto; quests: CourseQuestInstanceDto[] }> {
    return this.enrollmentService.enroll(user.id, versionId);
  }

  @Get('enrollment')
  @ApiOperation({ summary: 'Get current learner enrollment for a CourseVersion' })
  @ApiResponse({ status: 200, description: 'Learner enrollment details' })
  @ApiResponse({ status: 404, description: 'Not enrolled in this CourseVersion' })
  async getEnrollment(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CourseEnrollmentDto | null> {
    return this.enrollmentService.getEnrollment(user.id, versionId);
  }

  @Get('quests')
  @ApiOperation({ summary: 'List course quest instances and objective progress for this course version' })
  @ApiResponse({ status: 200, description: 'List of learner quest instances' })
  async listQuests(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CourseQuestInstanceDto[]> {
    return this.enrollmentService.listLearnerQuests(user.id, versionId);
  }
}
