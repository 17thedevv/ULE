import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CourseDto,
  CourseDraftDto,
  CourseVersionDto,
  CreateCourseResponse,
} from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CoursesService } from './courses.service';
import {
  CourseDraftResponseDto,
  CourseResponseDto,
  CourseVersionResponseDto,
  CreateCourseResponseDto,
} from './dto/course-response.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDraftDto } from './dto/update-draft.dto';

@ApiTags('Courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(AuthGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create private Course and initial Draft',
    description:
      'Creates a new Course with PRIVATE visibility owned by the current authenticated user.',
  })
  @ApiResponse({
    status: 201,
    description: 'Course and initial draft created successfully.',
    type: CreateCourseResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request. Validation failed.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Authentication required.',
  })
  async createCourse(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCourseDto,
  ): Promise<CreateCourseResponse> {
    return this.coursesService.createCourse(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List courses owned by current user',
    description:
      'Returns all private and owned courses created by the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of owned courses.',
    type: [CourseResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Authentication required.',
  })
  async listCourses(@CurrentUser() user: AuthUser): Promise<CourseDto[]> {
    return this.coursesService.listCourses(user.id);
  }

  @Get(':courseId')
  @ApiOperation({
    summary: 'Read owned Course metadata',
    description:
      'Reads course metadata. Returns 404 if not found or owned by another user.',
  })
  @ApiParam({ name: 'courseId', description: 'Unique Course ID' })
  @ApiResponse({
    status: 200,
    description: 'Course metadata.',
    type: CourseResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Course not found.',
  })
  async getCourse(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ): Promise<CourseDto> {
    return this.coursesService.getCourse(courseId, user.id);
  }

  @Get(':courseId/draft')
  @ApiOperation({
    summary: 'Read current Draft',
    description: 'Reads the active authoring draft for an owned Course.',
  })
  @ApiParam({ name: 'courseId', description: 'Unique Course ID' })
  @ApiResponse({
    status: 200,
    description: 'Active draft.',
    type: CourseDraftResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Course or draft not found.',
  })
  async getDraft(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ): Promise<CourseDraftDto> {
    return this.coursesService.getDraft(courseId, user.id);
  }

  @Patch(':courseId/draft')
  @ApiOperation({
    summary: 'Modify permitted draft fields',
    description:
      'Updates editable draft fields with optimistic concurrency control.',
  })
  @ApiParam({ name: 'courseId', description: 'Unique Course ID' })
  @ApiResponse({
    status: 200,
    description: 'Draft updated successfully.',
    type: CourseDraftResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict. Draft revision mismatch.',
  })
  async updateDraft(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Body() dto: UpdateCourseDraftDto,
  ): Promise<CourseDraftDto> {
    return this.coursesService.updateDraft(courseId, user.id, dto);
  }

  @Post(':courseId/versions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create immutable version from validated Draft',
    description:
      'Takes an immutable snapshot of the current draft and assigns an incremented version number.',
  })
  @ApiParam({ name: 'courseId', description: 'Unique Course ID' })
  @ApiResponse({
    status: 201,
    description: 'Immutable version snapshot created.',
    type: CourseVersionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request. Draft content invalid.',
  })
  async createVersion(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ): Promise<CourseVersionDto> {
    return this.coursesService.createVersion(courseId, user.id);
  }

  @Get(':courseId/versions')
  @ApiOperation({
    summary: 'List version history',
    description:
      'Returns immutable version snapshots created for this course in ascending order.',
  })
  @ApiParam({ name: 'courseId', description: 'Unique Course ID' })
  @ApiResponse({
    status: 200,
    description: 'Version history list.',
    type: [CourseVersionResponseDto],
  })
  async listVersions(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ): Promise<CourseVersionDto[]> {
    return this.coursesService.listVersions(courseId, user.id);
  }

  @Get(':courseId/versions/:versionId')
  @ApiOperation({
    summary: 'Read exact version snapshot',
    description:
      'Reads a specific immutable version snapshot by its unique version ID.',
  })
  @ApiParam({ name: 'courseId', description: 'Unique Course ID' })
  @ApiParam({ name: 'versionId', description: 'Unique Version ID' })
  @ApiResponse({
    status: 200,
    description: 'Exact version snapshot.',
    type: CourseVersionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Version not found.',
  })
  async getVersion(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Param('versionId') versionId: string,
  ): Promise<CourseVersionDto> {
    return this.coursesService.getVersion(courseId, versionId, user.id);
  }
}
