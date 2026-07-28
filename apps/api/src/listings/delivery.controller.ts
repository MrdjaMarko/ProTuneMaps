import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Param, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { AuthGuard } from "../auth/auth.guard";
import { ListingsService } from "./listings.service";

@Controller("v1")
export class DeliveryController {
  constructor(
    @Inject(ListingsService) private readonly listingsService: ListingsService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  @Post("listings/:listingId/entitlements")
  @UseGuards(AuthGuard)
  createEntitlement(
    @Req() request: { currentUserId: string },
    @Param("listingId") listingId: string,
    @Body() body: { versionId?: string }
  ) {
    return {
      entitlement: this.listingsService.createEntitlement(request.currentUserId, listingId, body)
    };
  }

  @Patch("entitlements/:entitlementId")
  @UseGuards(AuthGuard)
  upgradeEntitlement(
    @Req() request: { currentUserId: string },
    @Param("entitlementId") entitlementId: string,
    @Body() body: { versionId: string }
  ) {
    return {
      entitlement: this.listingsService.upgradeEntitlement(request.currentUserId, entitlementId, body.versionId)
    };
  }

  @Get("downloads/:entitlementId")
  @UseGuards(AuthGuard)
  getDownloadPage(@Req() request: { currentUserId: string }, @Param("entitlementId") entitlementId: string) {
    return this.listingsService.getDownloadPage(request.currentUserId, entitlementId);
  }

  @Post("listings/:listingId/checkout-preview")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  checkoutPreview(
    @Req() request: { currentUserId: string },
    @Param("listingId") listingId: string,
    @Body() body: { setupId?: string }
  ) {
    return this.listingsService.previewCheckout(request.currentUserId, listingId, body);
  }

  @Post("listings/:listingId/checkout")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  checkout(
    @Req() request: { currentUserId: string },
    @Param("listingId") listingId: string,
    @Body() body: { setupId?: string; acceptedLicense?: boolean; acceptedVinPolicy?: boolean }
  ) {
    return this.listingsService.attemptCheckout(request.currentUserId, listingId, body);
  }

  @Post("listings/:listingId/payments")
  @UseGuards(AuthGuard)
  processPayment(
    @Req() request: { currentUserId: string },
    @Res({ passthrough: true }) response: { status: (code: number) => { statusCode: number } },
    @Param("listingId") listingId: string,
    @Body()
    body: {
      setupId?: string;
      acceptedLicense?: boolean;
      acceptedVinPolicy?: boolean;
      idempotencyKey?: string;
      simulateFailure?: boolean;
    }
  ) {
    const paymentAttempt = this.listingsService.processPayment(request.currentUserId, listingId, body);
    if (paymentAttempt.payment.status === "failed") {
      response.status(402);
    } else if (paymentAttempt.replayed) {
      response.status(200);
    } else {
      response.status(201);
    }
    return paymentAttempt;
  }

  @Get("orders/:orderId")
  @UseGuards(AuthGuard)
  getOrder(@Req() request: { currentUserId: string }, @Param("orderId") orderId: string) {
    return this.listingsService.getOrder(request.currentUserId, orderId);
  }

  @Get("orders/:orderId/audit")
  @UseGuards(AuthGuard)
  getOrderAudit(@Req() request: { currentUserId: string }, @Param("orderId") orderId: string) {
    return this.listingsService.getOrderAudit(request.currentUserId, orderId);
  }

  @Post("admin/listings/:listingId/unpublish")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  unpublishListing(
    @Req() request: { currentUserId: string },
    @Param("listingId") listingId: string,
    @Body() body: { reason?: string }
  ) {
    this.assertAdmin(request.currentUserId);
    return this.listingsService.unpublishByAdmin(request.currentUserId, listingId, body.reason ?? "");
  }

  @Post("admin/listings/:listingId/republish")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  republishListing(
    @Req() request: { currentUserId: string },
    @Param("listingId") listingId: string,
    @Body() body: { reason?: string }
  ) {
    this.assertAdmin(request.currentUserId);
    return this.listingsService.republishByAdmin(request.currentUserId, listingId, body.reason ?? "");
  }

  @Get("admin/listings/:listingId/moderation-log")
  @UseGuards(AuthGuard)
  getModerationLog(@Req() request: { currentUserId: string }, @Param("listingId") listingId: string) {
    this.assertAdmin(request.currentUserId);
    return {
      events: this.listingsService.getModerationEvents(listingId)
    };
  }

  @Get("notifications")
  @UseGuards(AuthGuard)
  getNotifications(@Req() request: { currentUserId: string }) {
    return {
      notifications: this.listingsService.getNotifications(request.currentUserId)
    };
  }

  private assertAdmin(userId: string): void {
    const currentUser = this.authService.getUserById(userId);
    if (currentUser.role !== "admin") {
      throw new ForbiddenException("Admin role required");
    }
  }
}
