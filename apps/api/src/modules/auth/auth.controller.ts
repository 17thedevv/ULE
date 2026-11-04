import { All, Controller, Get, Header, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOkResponse, ApiOperation, ApiProperty } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

class AuthProvidersDto {
  @ApiProperty({ description: 'Whether Google sign-in is configured on this API.' })
  google!: boolean;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('providers')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get public sign-in provider availability' })
  @ApiOkResponse({ type: AuthProvidersDto })
  getProviders(): AuthProvidersDto {
    return { google: this.authService.isGoogleConfigured() };
  }

  @All('*')
  @ApiExcludeEndpoint()
  async handleAuth(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.authService.handleAuthRequest(req, res);
  }
}
