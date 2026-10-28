import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  DraftBlockInstanceDto,
  DraftValidationResponseDto,
} from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DraftBlocksService } from './draft-blocks.service';
import { AddDraftBlockDto } from './dto/add-draft-block.dto';
import {
  DraftBlockInstanceResponseDto,
  DraftValidationResponseDtoImpl,
} from './dto/block-response.dto';
import { ReorderDraftBlocksDto } from './dto/reorder-draft-blocks.dto';
import { UpdateDraftBlockDto } from './dto/update-draft-block.dto';

@ApiTags('ABP Draft Blocks')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('courses/:courseId/draft/blocks')
export class DraftBlocksController {
  constructor(private readonly draftBlocksService: DraftBlocksService) {}

  @Get()
  @ApiOperation({
    summary: 'List draft block instances',
    description: 'Retrieves all configured activity block instances for an owned course draft in sequence.',
  })
  @ApiParam({ name: 'courseId', description: 'Course identifier (UUID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of draft block instances',
    type: [DraftBlockInstanceResponseDto],
  })
  async listBlocks(
    @Param('courseId') courseId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DraftBlockInstanceDto[]> {
    return this.draftBlocksService.listDraftBlocks(courseId, userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Add block instance to draft',
    description:
      'Validates configuration against the registered ABP block type and appends/inserts it into the draft.',
  })
  @ApiParam({ name: 'courseId', description: 'Course identifier (UUID)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Block instance created successfully',
    type: DraftBlockInstanceResponseDto,
  })
  async addBlock(
    @Param('courseId') courseId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddDraftBlockDto,
  ): Promise<DraftBlockInstanceDto> {
    return this.draftBlocksService.addDraftBlock(courseId, userId, dto);
  }

  @Get(':blockId')
  @ApiOperation({
    summary: 'Get single draft block instance',
    description: 'Retrieves a single configured block instance from an owned course draft.',
  })
  @ApiParam({ name: 'courseId', description: 'Course identifier (UUID)' })
  @ApiParam({ name: 'blockId', description: 'Draft block identifier (UUID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Block instance found',
    type: DraftBlockInstanceResponseDto,
  })
  async getBlock(
    @Param('courseId') courseId: string,
    @Param('blockId') blockId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DraftBlockInstanceDto> {
    return this.draftBlocksService.getDraftBlock(courseId, blockId, userId);
  }

  @Patch(':blockId')
  @ApiOperation({
    summary: 'Update draft block instance',
    description: 'Modifies permitted fields of a block instance with optimistic concurrency protection.',
  })
  @ApiParam({ name: 'courseId', description: 'Course identifier (UUID)' })
  @ApiParam({ name: 'blockId', description: 'Draft block identifier (UUID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Block instance updated successfully',
    type: DraftBlockInstanceResponseDto,
  })
  async updateBlock(
    @Param('courseId') courseId: string,
    @Param('blockId') blockId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateDraftBlockDto,
  ): Promise<DraftBlockInstanceDto> {
    return this.draftBlocksService.updateDraftBlock(
      courseId,
      blockId,
      userId,
      dto,
    );
  }

  @Delete(':blockId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete draft block instance',
    description: 'Removes a block instance from the draft and re-indexes remaining blocks.',
  })
  @ApiParam({ name: 'courseId', description: 'Course identifier (UUID)' })
  @ApiParam({ name: 'blockId', description: 'Draft block identifier (UUID)' })
  @ApiQuery({
    name: 'expectedRevision',
    required: true,
    description: 'Expected draft revision for concurrency check',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Block instance deleted successfully',
  })
  async deleteBlock(
    @Param('courseId') courseId: string,
    @Param('blockId') blockId: string,
    @CurrentUser('id') userId: string,
    @Query('expectedRevision') expectedRevision?: string,
  ): Promise<void> {
    if (!expectedRevision) {
      throw new BadRequestException('expectedRevision query parameter is required.');
    }
    const revision = parseInt(expectedRevision, 10);
    if (isNaN(revision) || revision < 1) {
      throw new BadRequestException('expectedRevision must be a positive integer.');
    }
    return this.draftBlocksService.deleteDraftBlock(
      courseId,
      blockId,
      userId,
      revision,
    );
  }

  @Put('reorder')
  @ApiOperation({
    summary: 'Reorder draft block instances',
    description: 'Updates display order of all blocks in the draft according to the supplied array of IDs.',
  })
  @ApiParam({ name: 'courseId', description: 'Course identifier (UUID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Blocks reordered successfully',
    type: [DraftBlockInstanceResponseDto],
  })
  async reorderBlocks(
    @Param('courseId') courseId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReorderDraftBlocksDto,
  ): Promise<DraftBlockInstanceDto[]> {
    return this.draftBlocksService.reorderDraftBlocks(courseId, userId, dto);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate all draft block instances',
    description: 'Performs full validation check across all draft blocks against their developer schemas.',
  })
  @ApiParam({ name: 'courseId', description: 'Course identifier (UUID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Validation report across all draft blocks',
    type: DraftValidationResponseDtoImpl,
  })
  async validateBlocks(
    @Param('courseId') courseId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DraftValidationResponseDto> {
    return this.draftBlocksService.validateDraftBlocks(courseId, userId);
  }
}
