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
import { QuestionBankItemDto, QuestionVersionDto } from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CreateQuestionBankItemApiDto,
  QuestionBankQueryDto,
  UpdateQuestionBankItemApiDto,
} from './dto/question-bank.dto';
import { QuestionBankService } from './question-bank.service';
import {
  QuestionTypeDefinition,
  QuestionTypesRegistry,
} from './questions/question-types.registry';

@ApiTags('Question Bank')
@ApiBearerAuth()
@Controller('question-bank')
@UseGuards(AuthGuard)
export class QuestionBankController {
  constructor(
    private readonly questionBankService: QuestionBankService,
    private readonly questionTypesRegistry: QuestionTypesRegistry,
  ) {}

  @Get('types')
  @ApiOperation({
    summary: 'List allowlisted question types and evaluator support',
  })
  listTypes(): QuestionTypeDefinition[] {
    return this.questionTypesRegistry.listTypes();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a reusable QuestionBankItem',
  })
  @ApiResponse({ status: 201, description: 'Question bank item created successfully.' })
  async createItem(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateQuestionBankItemApiDto,
  ): Promise<QuestionBankItemDto> {
    return this.questionBankService.createItem(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List creator-owned QuestionBankItems',
  })
  async listItems(
    @CurrentUser() user: AuthUser,
    @Query() query: QuestionBankQueryDto,
  ): Promise<QuestionBankItemDto[]> {
    return this.questionBankService.listItems(user.id, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get QuestionBankItem details with full secret answerKey and rubric',
  })
  @ApiParam({ name: 'id', description: 'QuestionBankItem UUID' })
  async getItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<QuestionBankItemDto> {
    return this.questionBankService.getItem(id, user.id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update QuestionBankItem draft with optimistic revision check',
  })
  @ApiParam({ name: 'id', description: 'QuestionBankItem UUID' })
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateQuestionBankItemApiDto,
  ): Promise<QuestionBankItemDto> {
    return this.questionBankService.updateItem(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete QuestionBankItem (blocked if any version is pinned in published assessment)',
  })
  @ApiParam({ name: 'id', description: 'QuestionBankItem UUID' })
  async deleteItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ deleted: boolean; id: string }> {
    return this.questionBankService.deleteItem(id, user.id);
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Publish an immutable QuestionVersion snapshot',
  })
  @ApiParam({ name: 'id', description: 'QuestionBankItem UUID' })
  async publishVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<QuestionVersionDto> {
    return this.questionBankService.publishVersion(id, user.id);
  }

  @Get(':id/versions')
  @ApiOperation({
    summary: 'List published QuestionVersions for an item',
  })
  @ApiParam({ name: 'id', description: 'QuestionBankItem UUID' })
  async listVersions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<QuestionVersionDto[]> {
    return this.questionBankService.listVersions(id, user.id);
  }

  @Get(':id/versions/:versionNumber')
  @ApiOperation({
    summary: 'Get specific published QuestionVersion by version number',
  })
  @ApiParam({ name: 'id', description: 'QuestionBankItem UUID' })
  @ApiParam({ name: 'versionNumber', description: 'Version number integer' })
  async getVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
  ): Promise<QuestionVersionDto> {
    return this.questionBankService.getVersion(id, versionNumber, user.id);
  }
}
