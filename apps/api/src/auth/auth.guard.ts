import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const sessionToken = request.cookies?.ptm_session as string | undefined;

    if (!sessionToken) {
      throw new UnauthorizedException("Authentication required");
    }

    const session = this.authService.validateSessionToken(sessionToken);
    request.currentUserId = session.userId;
    return true;
  }
}
