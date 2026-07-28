import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { ListingsService } from "./listings.service";

@Controller("v1")
export class DeliveryController {
  constructor(@Inject(ListingsService) private readonly listingsService: ListingsService) {}

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
}
