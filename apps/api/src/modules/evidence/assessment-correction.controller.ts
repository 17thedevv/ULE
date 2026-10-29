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
import { AssessmentCorrectionDto } from '@ule/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { AssessmentCorrectionService } from './assessment-correction.service';
import { AssessmentCorrectionDto as CorrectionInputDto } from './dto/assessment-correction.dto';

@ApiTags('Evaluations')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('evaluations')
export class AssessmentCorrectionController {
  constructor(
    private readonly correctionService: AssessmentCorrectionService,
  ) {}

  @Post('correct')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply authorized evaluation correction or delayed grading',
    description: 'Authorized course owner or evaluator applies a versioned correction or delayed grade. Creates an append-only audit trail and reconciles evidence ledger and skill projections.',
  })
  @ApiResponse({ status: 200, description: 'Evaluation corrected successfully' })
  @ApiResponse({ status: 400, description: 'Invalid correction parameters' })
  @ApiResponse({ status: 404, description: 'AssessmentResult not found or unauthorized' })
  async correctAssessment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CorrectionInputDto,
  ): Promise<AssessmentCorrectionDto> {
    return this.correctionService.correctAssessment(user.id, dto);
  }

  @Get(':assessmentResultId/history')
  @ApiOperation({
    summary: 'Get auditable correction history',
    description: 'Retrieves append-only correction revisions for an AssessmentResult.',
  })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  @ApiResponse({ status: 404, description: 'AssessmentResult not found' })
  async getCorrectionHistory(
    @CurrentUser() user: AuthUser,
    @Param('assessmentResultId') assessmentResultId: string,
  ): Promise<AssessmentCorrectionDto[]> {
    return this.correctionService.getCorrectionHistory(user.id, assessmentResultId);
  }
}
