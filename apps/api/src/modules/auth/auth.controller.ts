import { All, Controller, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @All('*')
  @ApiExcludeEndpoint()
  async handleAuth(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.authService.handleAuthRequest(req, res);
  }
}
