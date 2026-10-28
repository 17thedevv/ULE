import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  @Get()
  @ApiOperation({
    summary: 'Get current authenticated user',
    description:
      'Returns the identity and session information of the currently authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authenticated user profile returned successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Missing or invalid session token.',
  })
  getMe(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image ?? null,
        createdAt: user.createdAt,
      },
      session: req.session
        ? {
            id: req.session.id,
            userId: req.session.userId,
            expiresAt: req.session.expiresAt,
          }
        : undefined,
    };
  }
}
