// @ts-nocheck
import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { AuthGuard } from "../auth/auth.guard";
import { ListingsService } from "./listings.service";

interface EntitlementResponse {
  entitlement: Record<string, unknown>;
}

interface CheckoutPreviewResponse {
  purchaseButtonDisabled: boolean;
  compatibility: Record<string, unknown>;
  orderSummary: Record<string, unknown>;
}

interface PaymentAttemptResponse {
  payment: Record<string, unknown>;
  order: Record<string, unknown>;
  entitlement?: Record<string, unknown>;
  replayed: boolean;
}

interface OrderResponse {
  order: Record<string, unknown>;
}

interface OrderAuditResponse {
  events: Record<string, unknown>[];
}

interface DownloadPageResponse {
  download: Record<string, unknown>;
}

interface DownloadAuditResponse {
  events: Record<string, unknown>[];
}

interface NotificationResponse {
  notifications: Record<string, unknown>[];
}

interface SupportTicketResponse {
  ticket: Record<string, unknown>;
}

interface SupportTicketMessageResponse {
  message: Record<string, unknown>;
}

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
  ): any {
    return {
      entitlement: this.listingsService.createEntitlement(request.currentUserId, listingId, body) as Record<string, unknown>
    };
  }

  @Patch("entitlements/:entitlementId")
  @UseGuards(AuthGuard)
  upgradeEntitlement(
    @Req() request: { currentUserId: string },
    @Param("entitlementId") entitlementId: string,
    @Body() body: { versionId: string }
  ): any {
    return {
      entitlement: this.listingsService.upgradeEntitlement(request.currentUserId, entitlementId, body.versionId) as Record<string, unknown>
    };
  }

  @Get("downloads/:entitlementId")
  @UseGuards(AuthGuard)
  getDownloadPage(@Req() request: { currentUserId: string }, @Param("entitlementId") entitlementId: string): any {
    return this.listingsService.getDownloadPage(request.currentUserId, entitlementId) as DownloadPageResponse;
  }

  @Get("downloads/:entitlementId/file")
  @UseGuards(AuthGuard)
  getDownloadFile(
    @Req() request: { currentUserId: string },
    @Param("entitlementId") entitlementId: string,
    @Query() query: { expiresAt?: string; signature?: string }
  ): any {
    return this.listingsService.accessDownload(request.currentUserId, entitlementId, query) as DownloadPageResponse;
  }

  @Get("downloads/:entitlementId/audit")
  @UseGuards(AuthGuard)
  getDownloadAudit(@Req() request: { currentUserId: string }, @Param("entitlementId") entitlementId: string): any {
    return this.listingsService.getDownloadAudit(request.currentUserId, entitlementId) as DownloadAuditResponse;
  }

  @Get("orders")
  @UseGuards(AuthGuard)
  getOrders(
    @Req() request: { currentUserId: string },
    @Query() query: { page?: string; limit?: string }
  ): any {
    return this.listingsService.getOrderHistory(request.currentUserId, query.page, query.limit);
  }

  @Post("orders/:orderId/support-tickets")
  @UseGuards(AuthGuard)
  createSupportTicket(
    @Req() request: { currentUserId: string },
    @Param("orderId") orderId: string,
    @Body() body: { issueType?: string; message?: string }
  ): any {
    return this.listingsService.createSupportTicket(request.currentUserId, orderId, body) as SupportTicketResponse;
  }

  @Get("support-tickets/:ticketId")
  @UseGuards(AuthGuard)
  getSupportTicket(@Req() request: { currentUserId: string }, @Param("ticketId") ticketId: string): any {
    return this.listingsService.getSupportTicket(request.currentUserId, ticketId) as SupportTicketResponse;
  }

  @Post("support-tickets/:ticketId/messages")
  @UseGuards(AuthGuard)
  createSupportTicketMessage(
    @Req() request: { currentUserId: string },
    @Param("ticketId") ticketId: string,
    @Body() body: { message?: string }
  ): any {
    return this.listingsService.createSupportTicketMessage(request.currentUserId, ticketId, body) as SupportTicketMessageResponse;
  }

  @Patch("support-tickets/:ticketId")
  @UseGuards(AuthGuard)
  updateSupportTicket(
    @Req() request: { currentUserId: string },
    @Param("ticketId") ticketId: string,
    @Body() body: { status?: string }
  ): any {
    return this.listingsService.updateSupportTicket(request.currentUserId, ticketId, body) as SupportTicketResponse;
  }

  @Post("listings/:listingId/checkout-preview")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  checkoutPreview(
    @Req() request: { currentUserId: string },
    @Param("listingId") listingId: string,
    @Body() body: { setupId?: string }
  ): any {
    return this.listingsService.previewCheckout(request.currentUserId, listingId, body) as CheckoutPreviewResponse;
  }

  @Post("listings/:listingId/checkout")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  checkout(
    @Req() request: { currentUserId: string },
    @Param("listingId") listingId: string,
    @Body() body: { setupId?: string; acceptedLicense?: boolean; acceptedVinPolicy?: boolean }
  ): any {
    return this.listingsService.attemptCheckout(request.currentUserId, listingId, body) as PaymentAttemptResponse;
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
  ): any {
    const paymentAttempt = this.listingsService.processPayment(request.currentUserId, listingId, body);
    if (paymentAttempt.payment.status === "failed") {
      response.status(402);
    } else if (paymentAttempt.replayed) {
      response.status(200);
    } else {
      response.status(201);
    }
    return paymentAttempt as PaymentAttemptResponse;
  }

  @Get("orders/:orderId")
  @UseGuards(AuthGuard)
  getOrder(@Req() request: { currentUserId: string }, @Param("orderId") orderId: string): any {
    return this.listingsService.getOrder(request.currentUserId, orderId) as OrderResponse;
  }

  @Get("orders/:orderId/audit")
  @UseGuards(AuthGuard)
  getOrderAudit(@Req() request: { currentUserId: string }, @Param("orderId") orderId: string): any {
    return this.listingsService.getOrderAudit(request.currentUserId, orderId) as OrderAuditResponse;
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
  getModerationLog(@Req() request: { currentUserId: string }, @Param("listingId") listingId: string): any {
    this.assertAdmin(request.currentUserId);
    return {
      events: this.listingsService.getModerationEvents(listingId) as Record<string, unknown>[]
    };
  }

  @Get("notifications")
  @UseGuards(AuthGuard)
  getNotifications(@Req() request: { currentUserId: string }): any {
    return {
      notifications: this.listingsService.getNotifications(request.currentUserId) as Record<string, unknown>[]
    };
  }

  private assertAdmin(userId: string): void {
    const currentUser = this.authService.getUserById(userId);
    if (currentUser.role !== "admin") {
      throw new ForbiddenException("Admin role required");
    }
  }
}
