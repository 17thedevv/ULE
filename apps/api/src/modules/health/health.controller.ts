import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'System health and readiness probe',
    description:
      'Evaluates API liveness and PostgreSQL database readiness via Prisma. Returns HTTP 200 when fully healthy or HTTP 503 when degraded.',
  })
  @ApiResponse({
    status: 200,
    description: 'System is healthy and all components are operational.',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'System is degraded; one or more dependencies (e.g. database) are unreachable.',
    type: HealthResponseDto,
  })
  async getHealth(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponseDto> {
    const health = await this.healthService.check();

    if (health.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }
}
