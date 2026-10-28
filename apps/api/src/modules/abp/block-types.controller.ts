import {
  Controller,
  Get,
  HttpStatus,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ABTypeManifest } from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { BlockTypeRegistry } from './registry/block-type.registry';

@ApiTags('ABP Block Types')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('abp/types')
export class BlockTypesController {
  constructor(private readonly registry: BlockTypeRegistry) {}

  @Get()
  @ApiOperation({
    summary: 'Discover supported ABP block types',
    description: 'Lists all developer-defined block types, their versions, and authoring capabilities.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of registered block type manifests',
  })
  listBlockTypes(): ABTypeManifest[] {
    return this.registry.listManifests();
  }

  @Get(':typeId')
  @ApiOperation({
    summary: 'Get block type manifest and schema',
    description: 'Retrieves capabilities, defaults, and schema requirements for a specific block type.',
  })
  @ApiParam({ name: 'typeId', description: 'Block type identifier (e.g. video, multiple-choice, coding)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Block type manifest details',
  })
  getBlockType(@Param('typeId') typeId: string): ABTypeManifest {
    return this.registry.getDefinition(typeId).manifest;
  }
}
