import {
  Body,
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
import { CourseSkillDto, DraftSkillMappingDto } from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateCourseSkillDto } from './dto/create-skill.dto';
import { UpsertDraftSkillMappingDto } from './dto/upsert-skill-mapping.dto';
import { SkillsService } from './skills.service';

@ApiTags('Skills')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('courses/:courseId')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Post('skills')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Define course-scoped skill',
    description: 'Creates a stable course-scoped skill definition with an observable learning objective under course owner authority.',
  })
  @ApiResponse({ status: 201, description: 'Skill defined successfully' })
  @ApiResponse({ status: 404, description: 'Course not found or unauthorized' })
  @ApiResponse({ status: 409, description: 'Skill code already exists in course' })
  async createSkill(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Body() dto: CreateCourseSkillDto,
  ): Promise<CourseSkillDto> {
    return this.skillsService.createSkill(user.id, courseId, dto);
  }

  @Get('skills')
  @ApiOperation({
    summary: 'List course-scoped skills',
    description: 'Retrieves all course-scoped skills defined for the course.',
  })
  @ApiResponse({ status: 200, description: 'Skills retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Course not found or unauthorized' })
  async listSkills(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ): Promise<CourseSkillDto[]> {
    return this.skillsService.listSkills(user.id, courseId);
  }

  @Post('draft/skill-mappings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Map draft block to skill',
    description: 'Creates or updates a mapping between a draft block/item and a course-scoped skill, enforcing draft optimistic concurrency.',
  })
  @ApiResponse({ status: 200, description: 'Skill mapping configured' })
  @ApiResponse({ status: 400, description: 'Invalid block or skill reference' })
  @ApiResponse({ status: 404, description: 'Course or draft not found' })
  @ApiResponse({ status: 409, description: 'Draft revision conflict' })
  async upsertSkillMapping(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Body() dto: UpsertDraftSkillMappingDto,
  ): Promise<DraftSkillMappingDto> {
    return this.skillsService.upsertDraftSkillMapping(user.id, courseId, dto);
  }

  @Get('draft/skill-mappings')
  @ApiOperation({
    summary: 'List draft skill mappings',
    description: 'Retrieves all current skill mappings configured on the editable draft.',
  })
  @ApiResponse({ status: 200, description: 'Mappings retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Course or draft not found' })
  async listSkillMappings(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ): Promise<DraftSkillMappingDto[]> {
    return this.skillsService.listDraftSkillMappings(user.id, courseId);
  }
}
