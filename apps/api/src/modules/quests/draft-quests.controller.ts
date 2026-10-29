import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DraftCourseQuestDto } from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { DraftQuestsService } from './draft-quests.service';
import { CreateDraftQuestDto } from './dto/create-draft-quest.dto';
import { UpdateDraftQuestDto } from './dto/update-draft-quest.dto';

@ApiTags('Course Quests (Authoring)')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('courses/:courseId/draft/quests')
export class DraftQuestsController {
  constructor(private readonly draftQuestsService: DraftQuestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new quest definition to an owned course draft' })
  @ApiResponse({ status: 201, description: 'Quest added to draft' })
  @ApiResponse({ status: 400, description: 'Invalid configuration or bindings' })
  @ApiResponse({ status: 404, description: 'Course or draft not found' })
  @ApiResponse({ status: 409, description: 'Duplicate quest key' })
  async createQuest(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDraftQuestDto,
  ): Promise<DraftCourseQuestDto> {
    return this.draftQuestsService.createDraftQuest(courseId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all draft quest definitions for an owned course' })
  @ApiResponse({ status: 200, description: 'List of draft quests' })
  @ApiResponse({ status: 404, description: 'Course or draft not found' })
  async listQuests(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DraftCourseQuestDto[]> {
    return this.draftQuestsService.listDraftQuests(courseId, user.id);
  }

  @Patch(':questId')
  @ApiOperation({ summary: 'Update an existing draft quest under optimistic locking' })
  @ApiResponse({ status: 200, description: 'Draft quest updated' })
  @ApiResponse({ status: 404, description: 'Course, draft, or quest not found' })
  @ApiResponse({ status: 409, description: 'Revision mismatch conflict' })
  async updateQuest(
    @Param('courseId') courseId: string,
    @Param('questId') questId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateDraftQuestDto,
  ): Promise<DraftCourseQuestDto> {
    return this.draftQuestsService.updateDraftQuest(courseId, questId, user.id, dto);
  }

  @Delete(':questId')
  @ApiOperation({ summary: 'Delete a draft quest definition under optimistic locking' })
  @ApiResponse({ status: 200, description: 'Draft quest deleted' })
  @ApiResponse({ status: 404, description: 'Course, draft, or quest not found' })
  @ApiResponse({ status: 409, description: 'Revision mismatch conflict' })
  async deleteQuest(
    @Param('courseId') courseId: string,
    @Param('questId') questId: string,
    @Query('expectedRevision') expectedRevisionStr: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ deleted: boolean }> {
    const expectedRevision = parseInt(expectedRevisionStr, 10);
    return this.draftQuestsService.deleteDraftQuest(courseId, questId, user.id, expectedRevision);
  }
}
