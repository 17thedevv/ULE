import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

/** RFC 8414 inserts .well-known before the issuer path, outside /api/v1/auth. */
@Controller()
@ApiExcludeController()
export class AuthDiscoveryController {
  constructor(private readonly authService: AuthService) {}

  @Get('.well-known/oauth-authorization-server/*issuerPath')
  async getAuthorizationServerMetadata(@Req() req: Request, @Res() res: Response): Promise<void> {
    // Better Auth serves metadata only for its configured issuer; arbitrary
    // paths are still rejected by its handler. Do not duplicate provider data.
    await this.authService.handleAuthRequest(req, res);
  }
}
