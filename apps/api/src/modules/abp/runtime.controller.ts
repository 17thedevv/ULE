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
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ABRunDto, RunResultsDto } from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ExecuteRunCommandDto } from './dto/execute-run-command.dto';
import {
  ABRunResponseDto,
  RunResultsResponseDto,
} from './dto/run-response.dto';
import { StartRunDto } from './dto/start-run.dto';
import { RuntimeService } from './runtime.service';

@ApiTags('ABP Runtime')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('runs')
export class RuntimeController {
  constructor(private readonly runtimeService: RuntimeService) {}

  @Post()
  @ApiOperation({
    summary: 'Start an Activity Block Run',
    description:
      'Instantiates an execution context pinned strictly to an immutable CourseVersion snapshot. Evaluator secrets are stripped from learner view.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Run started successfully',
    type: ABRunResponseDto,
  })
  async startRun(
    @CurrentUser('id') userId: string,
    @Body() dto: StartRunDto,
  ): Promise<ABRunDto> {
    return this.runtimeService.startRun(userId, dto);
  }

  @Get(':runId')
  @ApiOperation({
    summary: 'Get runtime state',
    description:
      'Reads permitted runtime state and sanitized block configuration for an active or closed run.',
  })
  @ApiParam({ name: 'runId', description: 'Run identifier (UUID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Current run state',
    type: ABRunResponseDto,
  })
  async getRun(
    @Param('runId') runId: string,
    @CurrentUser('id') userId: string,
  ): Promise<ABRunDto> {
    return this.runtimeService.getRun(runId, userId);
  }

  @Post(':runId/commands')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Execute a runtime lifecycle command',
    description:
      'Dispatches a host command (START, SUSPEND, RESUME, SUBMIT_RESPONSE, FINISH, ABANDON, FAIL) to the run state machine with idempotency protection.',
  })
  @ApiParam({ name: 'runId', description: 'Run identifier (UUID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Run state after command execution',
    type: ABRunResponseDto,
  })
  async executeCommand(
    @Param('runId') runId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ExecuteRunCommandDto,
  ): Promise<ABRunDto> {
    return this.runtimeService.executeCommand(runId, userId, dto);
  }

  @Get(':runId/results')
  @ApiOperation({
    summary: 'Get run attempts, assessments, and event audit trail',
    description:
      'Retrieves the complete historical record of learner attempts, server assessment results, and runtime event facts.',
  })
  @ApiParam({ name: 'runId', description: 'Run identifier (UUID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Historical attempts, assessments, and accepted events',
    type: RunResultsResponseDto,
  })
  async getRunResults(
    @Param('runId') runId: string,
    @CurrentUser('id') userId: string,
  ): Promise<RunResultsDto> {
    return this.runtimeService.getRunResults(runId, userId);
  }
}
