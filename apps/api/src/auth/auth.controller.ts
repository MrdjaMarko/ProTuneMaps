import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

@Controller("v1/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("signup")
  async signup(@Body() body: { email: string; password: string }) {
    return this.authService.signup(body.email, body.password);
  }

  @Post("verify-email")
  @HttpCode(200)
  verifyEmail(@Body() body: { token: string }) {
    this.authService.verifyEmail(body.token);
    return { verified: true };
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) response: FastifyReply
  ) {
    const result = await this.authService.login(body.email, body.password);
    response.setCookie("ptm_session", result.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24
    });
    return { user: result.user };
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: FastifyReply) {
    response.clearCookie("ptm_session", { path: "/" });
    return { loggedOut: true };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() request: { currentUserId: string }) {
    const user = this.authService.getUserById(request.currentUserId);
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified
    };
  }

  @Get("purchase-ready")
  @UseGuards(AuthGuard)
  purchaseReady(@Req() request: { currentUserId: string }) {
    const ready = this.authService.isPurchaseReady(request.currentUserId);
    if (!ready) {
      throw new ForbiddenException("Email verification required before purchase");
    }

    return { ready: true };
  }

  @Post("password/reset-request")
  @HttpCode(200)
  requestPasswordReset(@Body() body: { email: string }) {
    const { resetToken } = this.authService.requestPasswordReset(body.email);
    return {
      message: "If the account exists, a reset link has been sent.",
      resetToken
    };
  }

  @Post("password/reset-confirm")
  @HttpCode(200)
  async confirmPasswordReset(@Body() body: { token: string; newPassword: string }) {
    await this.authService.confirmPasswordReset(body.token, body.newPassword);
    return { reset: true };
  }
}
