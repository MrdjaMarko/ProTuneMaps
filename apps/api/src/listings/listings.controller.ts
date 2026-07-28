import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import { ListingsService } from "./listings.service";

@Controller("v1/listings")
export class ListingsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ListingsService) private readonly listingsService: ListingsService
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  createListing(
    @Req() request: { currentUserId: string },
    @Body()
    body: {
      title?: string;
      stage?: string;
      priceAmount?: number;
      priceCurrency?: string;
      saveAsDraft?: boolean;
      dynoImages?: string[];
      evidenceNotes?: string;
      knownLimitations?: string;
      requirements?: {
        make?: string;
        model?: string;
        engine?: string;
        ecuId?: string;
        transmission?: string;
        fuelType?: string;
        requiredMods?: string[];
      };
    }
  ) {
    const currentUser = this.authService.getUserById(request.currentUserId);

    if (currentUser.role !== "tuner") {
      throw new ForbiddenException("Tuner role required");
    }

    const listing = this.listingsService.create(request.currentUserId, body);

    return {
      created: true,
      listing
    };
  }

  @Patch(":listingId")
  @UseGuards(AuthGuard)
  updateListing(
    @Req() request: { currentUserId: string },
    @Param("listingId") listingId: string,
    @Body()
    body: {
      title?: string;
      stage?: string;
      priceAmount?: number;
      priceCurrency?: string;
      dynoImages?: string[];
      evidenceNotes?: string;
      knownLimitations?: string;
      requirements?: {
        make?: string;
        model?: string;
        engine?: string;
        ecuId?: string;
        transmission?: string;
        fuelType?: string;
        requiredMods?: string[];
      };
    }
  ) {
    const currentUser = this.authService.getUserById(request.currentUserId);

    if (currentUser.role !== "tuner") {
      throw new ForbiddenException("Tuner role required");
    }

    return {
      listing: this.listingsService.update(request.currentUserId, listingId, body)
    };
  }

  @Post(":listingId/publish")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  publishListing(@Req() request: { currentUserId: string }, @Param("listingId") listingId: string) {
    const currentUser = this.authService.getUserById(request.currentUserId);

    if (currentUser.role !== "tuner") {
      throw new ForbiddenException("Tuner role required");
    }

    return {
      listing: this.listingsService.publish(request.currentUserId, listingId)
    };
  }

  @Post(":listingId/versions")
  @UseGuards(AuthGuard)
  createVersion(
    @Req() request: { currentUserId: string },
    @Param("listingId") listingId: string,
    @Body() body: { semanticLabel?: string; changelogNotes?: string }
  ) {
    const currentUser = this.authService.getUserById(request.currentUserId);

    if (currentUser.role !== "tuner") {
      throw new ForbiddenException("Tuner role required");
    }

    return {
      version: this.listingsService.createVersion(request.currentUserId, listingId, body)
    };
  }

  @Get(":listingId")
  @UseGuards(AuthGuard)
  getListingDetail(@Req() request: { currentUserId: string }, @Param("listingId") listingId: string) {
    return this.listingsService.getListingDetail(request.currentUserId, listingId);
  }

  @Get()
  @UseGuards(AuthGuard)
  listWithCompatibility(@Req() request: { currentUserId: string }, @Query("setupId") setupId: string) {
    return {
      listings: this.listingsService.listWithCompatibility(request.currentUserId, setupId)
    };
  }

  @Get(":listingId/compatibility")
  @UseGuards(AuthGuard)
  getCompatibility(
    @Req() request: { currentUserId: string },
    @Param("listingId") listingId: string,
    @Query("setupId") setupId: string
  ) {
    return {
      compatibility: this.listingsService.getCompatibility(request.currentUserId, listingId, setupId)
    };
  }

  @Post(":listingId/purchase-check")
  @UseGuards(AuthGuard)
  purchaseCheck(
    @Req() request: { currentUserId: string },
    @Param("listingId") listingId: string,
    @Body() body: { setupId: string }
  ) {
    const result = this.listingsService.canPurchase(request.currentUserId, listingId, body.setupId);
    if (!result.canPurchase) {
      throw new ForbiddenException("Listing is not compatible with selected setup");
    }

    return {
      canPurchase: true,
      compatibility: result.compatibility
    };
  }
}
