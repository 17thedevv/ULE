import {
  Body,
  Controller,
  Delete,
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
import { CourseAccessGrantDto } from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccessGrantsService } from './access-grants.service';
import { CreateAccessGrantDto } from './dto/create-access-grant.dto';

@ApiTags('Access Grants')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('courses/:courseId/versions/:versionId/grants')
export class AccessGrantsController {
  constructor(private readonly grantsService: AccessGrantsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Grant learner access to private CourseVersion',
    description: 'Course owner explicitly grants execution and viewing access for a specific registered learner to an immutable CourseVersion.',
  })
  @ApiResponse({ status: 201, description: 'Access granted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid grant parameters' })
  @ApiResponse({ status: 404, description: 'Course or learner not found' })
  async createGrant(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Param('versionId') versionId: string,
    @Body() dto: CreateAccessGrantDto,
  ): Promise<CourseAccessGrantDto> {
    return this.grantsService.createGrant(user.id, courseId, versionId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List access grants for CourseVersion',
    description: 'Retrieves all active and revoked grants for this CourseVersion (owner only).',
  })
  @ApiResponse({ status: 200, description: 'Grants retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Course or version not found' })
  async listGrants(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Param('versionId') versionId: string,
  ): Promise<CourseAccessGrantDto[]> {
    return this.grantsService.listGrantsForVersion(user.id, courseId, versionId);
  }

  @Delete(':grantId')
  @ApiOperation({
    summary: 'Revoke access grant',
    description: 'Revokes access for the specified learner grant. Prevents starting new Runs.',
  })
  @ApiResponse({ status: 200, description: 'Grant revoked successfully' })
  @ApiResponse({ status: 404, description: 'Grant not found' })
  async revokeGrant(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Param('versionId') versionId: string,
    @Param('grantId') grantId: string,
  ): Promise<CourseAccessGrantDto> {
    return this.grantsService.revokeGrant(user.id, courseId, versionId, grantId);
  }
}
