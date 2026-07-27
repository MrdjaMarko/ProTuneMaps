import { Body, Controller, ForbiddenException, HttpCode, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import { TunerService } from "./tuner.service";

@Controller("v1")
export class TunerController {
  constructor(
    @Inject(TunerService) private readonly tunerService: TunerService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  @Post("tuner/request-verification")
  @UseGuards(AuthGuard)
  requestVerification(
    @Req() request: { currentUserId: string },
    @Body() body: { displayName: string; businessLocation: string; contactEmail: string }
  ) {
    return this.tunerService.requestVerification(request.currentUserId, body);
  }

  @Post("admin/tuner-requests/:profileId/approve")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  approve(@Req() request: { currentUserId: string }, @Param("profileId") profileId: string) {
    this.assertAdmin(request.currentUserId);
    return this.tunerService.approve(profileId);
  }

  @Post("admin/tuner-requests/:profileId/reject")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  reject(@Req() request: { currentUserId: string }, @Param("profileId") profileId: string) {
    this.assertAdmin(request.currentUserId);
    return this.tunerService.reject(profileId);
  }

  private assertAdmin(userId: string): void {
    const currentUser = this.authService.getUserById(userId);
    if (currentUser.role !== "admin") {
      throw new ForbiddenException("Admin role required");
    }
  }
}
