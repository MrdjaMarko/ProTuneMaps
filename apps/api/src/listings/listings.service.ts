import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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
  publishStatus: "draft" | "published";
  dynoImages: string[];
  evidenceNotes: string;
  knownLimitations: string;
  createdAt: number;
  requirements: ListingRequirements;
}

interface CreateListingInput {
  title?: string;
  stage?: string;
  priceAmount?: number;
  priceCurrency?: string;
  saveAsDraft?: boolean;
  dynoImages?: string[];
  evidenceNotes?: string;
  knownLimitations?: string;
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

interface UpdateListingInput {
  title?: string;
  stage?: string;
  priceAmount?: number;
  priceCurrency?: string;
  dynoImages?: string[];
  evidenceNotes?: string;
  knownLimitations?: string;
  requirements?: Partial<ListingRequirements>;
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

    const normalizedRequirements: ListingRequirements = {
      make: input.requirements?.make?.trim(),
      model: input.requirements?.model?.trim(),
      engine: input.requirements?.engine?.trim(),
      ecuId: input.requirements?.ecuId?.trim(),
      transmission: input.requirements?.transmission?.trim(),
      fuelType: input.requirements?.fuelType?.trim(),
      requiredMods: (input.requirements?.requiredMods ?? []).map((mod) => mod.trim()).filter((mod) => mod.length > 0)
    };

    const normalizedTitle = (input.title?.trim() || "Untitled").trim();
    const normalizedStage = (input.stage?.trim() || "Stage 1").trim();
    const normalizedPriceAmount = input.priceAmount ?? 0;
    const normalizedPriceCurrency = (input.priceCurrency?.trim() || "EUR").trim();
    const normalizedDynoImages = (input.dynoImages ?? []).map((image) => image.trim()).filter((image) => image.length > 0);
    const normalizedEvidenceNotes = input.evidenceNotes?.trim() ?? "";
    const normalizedKnownLimitations = input.knownLimitations?.trim() ?? "";

    const missingFields = this.getPublishMissingFields({
      title: normalizedTitle,
      stage: normalizedStage,
      priceAmount: normalizedPriceAmount,
      requirements: normalizedRequirements
    });

    const publishStatus: "draft" | "published" = input.saveAsDraft || missingFields.length > 0 ? "draft" : "published";

    const listing: ListingRecord = {
      id: randomUUID(),
      tunerUserId,
      tunerDisplayName: tunerSummary.displayName,
      tunerVerificationStatus: tunerSummary.verificationStatus,
      title: normalizedTitle,
      stage: normalizedStage,
      priceAmount: normalizedPriceAmount,
      priceCurrency: normalizedPriceCurrency,
      publishStatus,
      dynoImages: normalizedDynoImages,
      evidenceNotes: normalizedEvidenceNotes,
      knownLimitations: normalizedKnownLimitations,
      createdAt: Date.now(),
      requirements: normalizedRequirements
    };

    this.listingsById.set(listing.id, listing);
    return listing;
  }

  update(tunerUserId: string, listingId: string, input: UpdateListingInput): ListingRecord {
    const listing = this.getOwnedListing(tunerUserId, listingId);

    if (typeof input.title !== "undefined") {
      listing.title = input.title.trim() || listing.title;
    }

    if (typeof input.stage !== "undefined") {
      listing.stage = input.stage.trim() || listing.stage;
    }

    if (typeof input.priceAmount !== "undefined") {
      listing.priceAmount = input.priceAmount;
    }

    if (typeof input.priceCurrency !== "undefined") {
      listing.priceCurrency = input.priceCurrency.trim() || listing.priceCurrency;
    }

    if (typeof input.dynoImages !== "undefined") {
      listing.dynoImages = input.dynoImages.map((image) => image.trim()).filter((image) => image.length > 0);
    }

    if (typeof input.evidenceNotes !== "undefined") {
      listing.evidenceNotes = input.evidenceNotes.trim();
    }

    if (typeof input.knownLimitations !== "undefined") {
      listing.knownLimitations = input.knownLimitations.trim();
    }

    if (input.requirements) {
      if (typeof input.requirements.make !== "undefined") {
        listing.requirements.make = input.requirements.make?.trim();
      }
      if (typeof input.requirements.model !== "undefined") {
        listing.requirements.model = input.requirements.model?.trim();
      }
      if (typeof input.requirements.engine !== "undefined") {
        listing.requirements.engine = input.requirements.engine?.trim();
      }
      if (typeof input.requirements.ecuId !== "undefined") {
        listing.requirements.ecuId = input.requirements.ecuId?.trim();
      }
      if (typeof input.requirements.transmission !== "undefined") {
        listing.requirements.transmission = input.requirements.transmission?.trim();
      }
      if (typeof input.requirements.fuelType !== "undefined") {
        listing.requirements.fuelType = input.requirements.fuelType?.trim();
      }
      if (typeof input.requirements.requiredMods !== "undefined") {
        listing.requirements.requiredMods = input.requirements.requiredMods
          .map((mod) => mod.trim())
          .filter((mod) => mod.length > 0);
      }
    }

    return listing;
  }

  publish(tunerUserId: string, listingId: string): ListingRecord {
    const listing = this.getOwnedListing(tunerUserId, listingId);

    const missingFields = this.getPublishMissingFields({
      title: listing.title,
      stage: listing.stage,
      priceAmount: listing.priceAmount,
      requirements: listing.requirements
    });

    if (missingFields.length > 0) {
      throw new BadRequestException(`Cannot publish: required fields missing or invalid (${missingFields.join(", ")})`);
    }

    listing.publishStatus = "published";
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
      .filter((listing) => listing.publishStatus === "published")
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
      .filter((listing) => listing.tunerUserId === tunerUserId && listing.publishStatus === "published")
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

  private getOwnedListing(tunerUserId: string, listingId: string): ListingRecord {
    const listing = this.listingsById.get(listingId);
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    if (listing.tunerUserId !== tunerUserId) {
      throw new ForbiddenException("Listing ownership required");
    }

    return listing;
  }

  private getPublishMissingFields(input: {
    title: string;
    stage: string;
    priceAmount: number;
    requirements: ListingRequirements;
  }): string[] {
    const missingFields: string[] = [];

    if (!input.title.trim()) {
      missingFields.push("title");
    }

    if (!input.stage.trim()) {
      missingFields.push("stage");
    }

    if (typeof input.priceAmount !== "number" || Number.isNaN(input.priceAmount) || input.priceAmount <= 0) {
      missingFields.push("priceAmount");
    }

    if (!input.requirements.make?.trim()) {
      missingFields.push("requirements.make");
    }
    if (!input.requirements.model?.trim()) {
      missingFields.push("requirements.model");
    }
    if (!input.requirements.engine?.trim()) {
      missingFields.push("requirements.engine");
    }
    if (!input.requirements.ecuId?.trim()) {
      missingFields.push("requirements.ecuId");
    }
    if (!input.requirements.fuelType?.trim()) {
      missingFields.push("requirements.fuelType");
    }

    return missingFields;
  }
}
