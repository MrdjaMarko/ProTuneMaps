import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  CompatibilityService,
  type CompatibilityResult,
  type ListingRequirements
} from "../compatibility/compatibility.service";
import { VehicleSetupsService } from "../vehicle-setups/vehicle-setups.service";

interface ListingRecord {
  id: string;
  tunerUserId: string;
  title: string;
  requirements: ListingRequirements;
}

interface CreateListingInput {
  title?: string;
  requirements?: Partial<ListingRequirements>;
}

@Injectable()
export class ListingsService {
  private readonly listingsById = new Map<string, ListingRecord>();

  constructor(
    @Inject(CompatibilityService) private readonly compatibilityService: CompatibilityService,
    @Inject(VehicleSetupsService) private readonly vehicleSetupsService: VehicleSetupsService
  ) {}

  create(tunerUserId: string, input: CreateListingInput): ListingRecord {
    const listing: ListingRecord = {
      id: randomUUID(),
      tunerUserId,
      title: (input.title?.trim() || "Untitled").trim(),
      requirements: {
        make: input.requirements?.make?.trim(),
        model: input.requirements?.model?.trim(),
        engine: input.requirements?.engine?.trim(),
        ecuId: input.requirements?.ecuId?.trim(),
        transmission: input.requirements?.transmission?.trim(),
        fuelType: input.requirements?.fuelType?.trim(),
        requiredMods: (input.requirements?.requiredMods ?? [])
          .map((mod) => mod.trim())
          .filter((mod) => mod.length > 0)
      }
    };

    this.listingsById.set(listing.id, listing);
    return listing;
  }

  listWithCompatibility(userId: string, setupId: string): Array<ListingRecord & { compatibility: CompatibilityResult }> {
    const setup = this.vehicleSetupsService.getSetupForCompatibility(userId, setupId);

    return [...this.listingsById.values()].map((listing) => ({
      ...listing,
      compatibility: this.compatibilityService.evaluate(listing.requirements, setup)
    }));
  }

  getCompatibility(userId: string, listingId: string, setupId: string): CompatibilityResult {
    const listing = this.listingsById.get(listingId);
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    const setup = this.vehicleSetupsService.getSetupForCompatibility(userId, setupId);
    return this.compatibilityService.evaluate(listing.requirements, setup);
  }

  canPurchase(userId: string, listingId: string, setupId: string): { canPurchase: boolean; compatibility: CompatibilityResult } {
    const compatibility = this.getCompatibility(userId, listingId, setupId);
    return {
      canPurchase: compatibility.status !== "Not Compatible",
      compatibility
    };
  }
}
