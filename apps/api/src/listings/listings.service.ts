import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  CompatibilityService,
  type CompatibilityStatus,
  type CompatibilityResult,
  type ListingRequirements
} from "../compatibility/compatibility.service";
import { TunerService } from "../tuner/tuner.service";
import { VehicleSetupsService } from "../vehicle-setups/vehicle-setups.service";

interface ListingRecord {
  id: string;
  tunerUserId: string;
  tunerDisplayName: string;
  tunerVerificationStatus: "pending" | "approved" | "rejected";
  title: string;
  stage: string;
  priceAmount: number;
  priceCurrency: string;
  createdAt: number;
  requirements: ListingRequirements;
}

interface CreateListingInput {
  title?: string;
  stage?: string;
  priceAmount?: number;
  priceCurrency?: string;
  requirements?: Partial<ListingRequirements>;
}

interface MarketplaceSearchQuery {
  setupId: string;
  make?: string;
  model?: string;
  engine?: string;
  fuelType?: string;
  stage?: string;
  sort?: "relevance" | "newest";
}

interface PublishedMapCard {
  id: string;
  title: string;
  stage: string;
  priceAmount: number;
  priceCurrency: string;
}

@Injectable()
export class ListingsService {
  private readonly listingsById = new Map<string, ListingRecord>();

  constructor(
    @Inject(CompatibilityService) private readonly compatibilityService: CompatibilityService,
    @Inject(VehicleSetupsService) private readonly vehicleSetupsService: VehicleSetupsService,
    @Inject(TunerService) private readonly tunerService: TunerService
  ) {}

  create(tunerUserId: string, input: CreateListingInput): ListingRecord {
    const tunerSummary = this.tunerService.getTunerSummary(tunerUserId);

    const listing: ListingRecord = {
      id: randomUUID(),
      tunerUserId,
      tunerDisplayName: tunerSummary.displayName,
      tunerVerificationStatus: tunerSummary.verificationStatus,
      title: (input.title?.trim() || "Untitled").trim(),
      stage: (input.stage?.trim() || "Stage 1").trim(),
      priceAmount: input.priceAmount ?? 0,
      priceCurrency: (input.priceCurrency?.trim() || "EUR").trim(),
      createdAt: Date.now(),
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

  searchMarketplace(userId: string, query: MarketplaceSearchQuery): {
    results: Array<
      ListingRecord & {
        compatibility: CompatibilityResult;
      }
    >;
  } {
    const setup = this.vehicleSetupsService.getSetupForCompatibility(userId, query.setupId);

    const normalizedMake = query.make?.trim().toLowerCase();
    const normalizedModel = query.model?.trim().toLowerCase();
    const normalizedEngine = query.engine?.trim().toLowerCase();
    const normalizedFuelType = query.fuelType?.trim().toLowerCase();
    const normalizedStage = query.stage?.trim().toLowerCase();

    const filtered = [...this.listingsById.values()]
      .filter((listing) => {
        if (normalizedMake && listing.requirements.make?.trim().toLowerCase() !== normalizedMake) {
          return false;
        }
        if (normalizedModel && listing.requirements.model?.trim().toLowerCase() !== normalizedModel) {
          return false;
        }
        if (normalizedEngine && listing.requirements.engine?.trim().toLowerCase() !== normalizedEngine) {
          return false;
        }
        if (normalizedFuelType && listing.requirements.fuelType?.trim().toLowerCase() !== normalizedFuelType) {
          return false;
        }
        if (normalizedStage && listing.stage.trim().toLowerCase() !== normalizedStage) {
          return false;
        }

        return true;
      })
      .map((listing) => ({
        ...listing,
        compatibility: this.compatibilityService.evaluate(listing.requirements, setup)
      }));

    const sortMode = query.sort ?? "relevance";

    if (sortMode === "newest") {
      filtered.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      filtered.sort((a, b) => {
        const scoreDelta = this.compatibilityScore(b.compatibility.status) - this.compatibilityScore(a.compatibility.status);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }

        return b.createdAt - a.createdAt;
      });
    }

    return { results: filtered };
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

  getPublishedMapsByTunerUserId(tunerUserId: string): PublishedMapCard[] {
    return [...this.listingsById.values()]
      .filter((listing) => listing.tunerUserId === tunerUserId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((listing) => ({
        id: listing.id,
        title: listing.title,
        stage: listing.stage,
        priceAmount: listing.priceAmount,
        priceCurrency: listing.priceCurrency
      }));
  }

  private compatibilityScore(status: CompatibilityStatus): number {
    if (status === "Compatible") {
      return 3;
    }

    if (status === "Partially Compatible") {
      return 2;
    }

    return 1;
  }
}
