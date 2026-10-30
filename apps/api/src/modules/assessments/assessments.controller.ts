import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
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
  AssessmentDefinitionDto,
  AssessmentItemRefDto,
  AssessmentSectionDto,
  AssessmentVersionDto,
  SanitizedLearnerAssessmentPreviewDto,
} from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { AssessmentsService } from './assessments.service';
import {
  AddAssessmentItemApiDto,
  CreateAssessmentDefinitionApiDto,
  CreateAssessmentSectionApiDto,
  PublishAssessmentApiDto,
  UpdateAssessmentDefinitionApiDto,
  UpdateAssessmentItemApiDto,
  UpdateAssessmentSectionApiDto,
} from './dto/assessment.dto';

@ApiTags('Assessments & Examinations')
@ApiBearerAuth()
@Controller('assessments')
@UseGuards(AuthGuard)
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create draft AssessmentDefinition',
  })
  @ApiResponse({ status: 201, description: 'Assessment definition created successfully.' })
  async createAssessment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAssessmentDefinitionApiDto,
  ): Promise<AssessmentDefinitionDto> {
    return this.assessmentsService.createAssessment(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List creator-owned AssessmentDefinitions',
  })
  async listAssessments(
    @CurrentUser() user: AuthUser,
    @Query('courseId') courseId?: string,
  ): Promise<AssessmentDefinitionDto[]> {
    return this.assessmentsService.listAssessments(user.id, courseId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get AssessmentDefinition with sections and item references',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  async getAssessment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<AssessmentDefinitionDto> {
    return this.assessmentsService.getAssessment(id, user.id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update AssessmentDefinition metadata with optimistic revision check',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  async updateAssessment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentDefinitionApiDto,
  ): Promise<AssessmentDefinitionDto> {
    return this.assessmentsService.updateAssessment(id, user.id, dto);
  }

  @Post(':id/sections')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a section to an AssessmentDefinition',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  async addSection(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateAssessmentSectionApiDto,
  ): Promise<AssessmentSectionDto> {
    return this.assessmentsService.addSection(id, user.id, dto);
  }

  @Put(':id/sections/:sectionId')
  @ApiOperation({
    summary: 'Update a section in an AssessmentDefinition',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  @ApiParam({ name: 'sectionId', description: 'AssessmentSection UUID' })
  async updateSection(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateAssessmentSectionApiDto,
  ): Promise<AssessmentSectionDto> {
    return this.assessmentsService.updateSection(id, sectionId, user.id, dto);
  }

  @Delete(':id/sections/:sectionId')
  @ApiOperation({
    summary: 'Delete a section from an AssessmentDefinition',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  @ApiParam({ name: 'sectionId', description: 'AssessmentSection UUID' })
  async deleteSection(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
  ): Promise<{ deleted: boolean; sectionId: string }> {
    return this.assessmentsService.deleteSection(id, sectionId, user.id);
  }

  @Post(':id/sections/:sectionId/items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a QuestionBankItem reference to an assessment section',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  @ApiParam({ name: 'sectionId', description: 'AssessmentSection UUID' })
  async addItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: AddAssessmentItemApiDto,
  ): Promise<AssessmentItemRefDto> {
    return this.assessmentsService.addItem(id, sectionId, user.id, dto);
  }

  @Put(':id/sections/:sectionId/items/:itemId')
  @ApiOperation({
    summary: 'Update an item reference within a section',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  @ApiParam({ name: 'sectionId', description: 'AssessmentSection UUID' })
  @ApiParam({ name: 'itemId', description: 'AssessmentItemRef UUID' })
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateAssessmentItemApiDto,
  ): Promise<AssessmentItemRefDto> {
    return this.assessmentsService.updateItem(id, sectionId, itemId, user.id, dto);
  }

  @Delete(':id/sections/:sectionId/items/:itemId')
  @ApiOperation({
    summary: 'Remove an item reference from a section',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  @ApiParam({ name: 'sectionId', description: 'AssessmentSection UUID' })
  @ApiParam({ name: 'itemId', description: 'AssessmentItemRef UUID' })
  async removeItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Param('itemId') itemId: string,
  ): Promise<{ deleted: boolean; itemId: string }> {
    return this.assessmentsService.removeItem(id, sectionId, itemId, user.id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Validate assessment blueprint and publish immutable AssessmentVersion snapshot',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  async publishAssessment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto?: PublishAssessmentApiDto,
  ): Promise<AssessmentVersionDto> {
    return this.assessmentsService.publishAssessment(id, user.id, dto?.idempotencyKey);
  }

  @Get(':id/versions')
  @ApiOperation({
    summary: 'List published AssessmentVersions for an assessment',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  async listVersions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<AssessmentVersionDto[]> {
    return this.assessmentsService.listVersions(id, user.id);
  }

  @Get(':id/versions/:versionNumber')
  @ApiOperation({
    summary: 'Get published AssessmentVersion by version number',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  @ApiParam({ name: 'versionNumber', description: 'Version number integer' })
  async getVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
  ): Promise<AssessmentVersionDto> {
    return this.assessmentsService.getVersion(id, versionNumber, user.id);
  }

  @Get(':id/versions/:versionNumber/preview')
  @ApiOperation({
    summary: 'Get sanitized learner-facing assessment preview (restricted to creator in Phase 5.5)',
  })
  @ApiParam({ name: 'id', description: 'AssessmentDefinition UUID' })
  @ApiParam({ name: 'versionNumber', description: 'Version number integer' })
  async getSanitizedLearnerPreview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
  ): Promise<SanitizedLearnerAssessmentPreviewDto> {
    return this.assessmentsService.getSanitizedLearnerPreview(id, versionNumber, user.id);
  }
}
