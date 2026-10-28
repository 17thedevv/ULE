import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthSessionContext, AuthUser } from './auth.types';

declare module 'express' {
  interface Request {
    user?: AuthUser;
    session?: AuthSessionContext['session'];
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionContext =
      await this.authService.getSessionFromRequest(request);

    if (!sessionContext || !sessionContext.user) {
      throw new UnauthorizedException(
        'Authentication required. Please sign in or provide a valid session token.',
      );
    }

    request.user = sessionContext.user;
    request.session = sessionContext.session;

    return true;
  }
}
