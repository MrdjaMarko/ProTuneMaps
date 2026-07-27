import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { ListingsService } from "./listings.service";

@Controller("v1/marketplace")
export class MarketplaceController {
  constructor(@Inject(ListingsService) private readonly listingsService: ListingsService) {}

  @Get("search")
  @UseGuards(AuthGuard)
  search(
    @Req() request: { currentUserId: string },
    @Query("setupId") setupId: string,
    @Query("make") make?: string,
    @Query("model") model?: string,
    @Query("engine") engine?: string,
    @Query("fuelType") fuelType?: string,
    @Query("stage") stage?: string,
    @Query("sort") sort?: "relevance" | "newest"
  ) {
    return this.listingsService.searchMarketplace(request.currentUserId, {
      setupId,
      make,
      model,
      engine,
      fuelType,
      stage,
      sort
    });
  }
}
