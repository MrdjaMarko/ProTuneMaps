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

interface ListingVersionRecord {
  id: string;
  listingId: string;
  semanticLabel: string;
  changelogNotes: string;
  createdAt: number;
}

interface EntitlementRecord {
  id: string;
  listingId: string;
  userId: string;
  versionId: string;
  createdAt: number;
  upgradedAt: number | null;
}

interface ModerationEventRecord {
  id: string;
  listingId: string;
  action: "unpublish" | "republish";
  reason: string;
  actorUserId: string;
  createdAt: number;
}

interface NotificationRecord {
  id: string;
  userId: string;
  listingId: string;
  message: string;
  createdAt: number;
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

interface CreateListingVersionInput {
  semanticLabel?: string;
  changelogNotes?: string;
}

interface CreateEntitlementInput {
  versionId?: string;
}

interface CheckoutPreviewInput {
  setupId?: string;
}

interface CheckoutAttemptInput {
  setupId?: string;
  acceptedLicense?: boolean;
  acceptedVinPolicy?: boolean;
}

interface CheckoutSummary {
  listing: {
    id: string;
    title: string;
    stage: string;
    priceAmount: number;
    priceCurrency: string;
  };
  setup: {
    id: string;
    make: string;
    model: string;
    engine: string;
    ecuId: string;
    transmission: string;
    fuelType: string;
    installedMods: string[];
  };
  versionId: string;
  semanticLabel: string;
  versionTimestamp: number;
}

@Injectable()
export class ListingsService {
  private readonly listingsById = new Map<string, ListingRecord>();
  private readonly versionsByListingId = new Map<string, ListingVersionRecord[]>();
  private readonly entitlementsById = new Map<string, EntitlementRecord>();
  private readonly moderationEventsByListingId = new Map<string, ModerationEventRecord[]>();
  private readonly notificationsByUserId = new Map<string, NotificationRecord[]>();

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

    const missingFields = this.getPublishMissingFields({
      title: listing.title,
      stage: listing.stage,
      priceAmount: listing.priceAmount,
      requirements: listing.requirements
    });

    if (missingFields.length > 0) {
      listing.publishStatus = "draft";
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

  unpublishByAdmin(adminUserId: string, listingId: string, reason: string): {
    listing: ListingRecord;
    moderation: ModerationEventRecord;
  } {
    const listing = this.getListingById(listingId);
    const normalizedReason = reason?.trim();

    if (!normalizedReason) {
      throw new BadRequestException("Reason is required");
    }

    listing.publishStatus = "draft";

    const moderation: ModerationEventRecord = {
      id: randomUUID(),
      listingId: listing.id,
      action: "unpublish",
      reason: normalizedReason,
      actorUserId: adminUserId,
      createdAt: Date.now()
    };

    this.appendModerationEvent(listing.id, moderation);
    this.appendNotification(listing.tunerUserId, {
      id: randomUUID(),
      userId: listing.tunerUserId,
      listingId: listing.id,
      message: `Your listing "${listing.title}" was unpublished: ${normalizedReason}`,
      createdAt: moderation.createdAt
    });

    return {
      listing,
      moderation
    };
  }

  republishByAdmin(adminUserId: string, listingId: string, reason: string): {
    listing: ListingRecord;
    moderation: ModerationEventRecord;
  } {
    const listing = this.getListingById(listingId);
    const normalizedReason = reason?.trim();

    if (!normalizedReason) {
      throw new BadRequestException("Reason is required");
    }

    const missingFields = this.getPublishMissingFields({
      title: listing.title,
      stage: listing.stage,
      priceAmount: listing.priceAmount,
      requirements: listing.requirements
    });

    if (missingFields.length > 0) {
      throw new BadRequestException(`Cannot republish: required fields missing or invalid (${missingFields.join(", ")})`);
    }

    listing.publishStatus = "published";

    const moderation: ModerationEventRecord = {
      id: randomUUID(),
      listingId: listing.id,
      action: "republish",
      reason: normalizedReason,
      actorUserId: adminUserId,
      createdAt: Date.now()
    };

    this.appendModerationEvent(listing.id, moderation);
    this.appendNotification(listing.tunerUserId, {
      id: randomUUID(),
      userId: listing.tunerUserId,
      listingId: listing.id,
      message: `Your listing "${listing.title}" was republished: ${normalizedReason}`,
      createdAt: moderation.createdAt
    });

    return {
      listing,
      moderation
    };
  }

  getModerationEvents(listingId: string): ModerationEventRecord[] {
    this.getListingById(listingId);
    return [...(this.moderationEventsByListingId.get(listingId) ?? [])];
  }

  getNotifications(userId: string): NotificationRecord[] {
    return [...(this.notificationsByUserId.get(userId) ?? [])];
  }

  previewCheckout(userId: string, listingId: string, input: CheckoutPreviewInput): {
    purchaseButtonDisabled: boolean;
    compatibility: CompatibilityResult;
    orderSummary: CheckoutSummary;
  } {
    const listing = this.getListingById(listingId);
    const setup = this.vehicleSetupsService.getSetupForCompatibility(userId, input.setupId ?? "");
    const compatibility = this.compatibilityService.evaluate(listing.requirements, setup);
    const version = this.resolveVersion(listing.id);

    return {
      purchaseButtonDisabled: compatibility.status === "Not Compatible",
      compatibility,
      orderSummary: this.buildCheckoutSummary(listing, setup, version)
    };
  }

  attemptCheckout(userId: string, listingId: string, input: CheckoutAttemptInput): {
    order: CheckoutSummary & {
      acceptedLicense: boolean;
      acceptedVinPolicy: boolean;
      compatibilityStatus: CompatibilityResult["status"];
      createdAt: number;
    };
  } {
    const listing = this.getListingById(listingId);

    if (!input.acceptedLicense || !input.acceptedVinPolicy) {
      throw new BadRequestException("Required terms must be accepted");
    }

    const setup = this.vehicleSetupsService.getSetupForCompatibility(userId, input.setupId ?? "");
    const compatibility = this.compatibilityService.evaluate(listing.requirements, setup);

    if (compatibility.status === "Not Compatible") {
      throw new ForbiddenException("Checkout blocked by compatibility gate");
    }

    const version = this.resolveVersion(listing.id);
    const orderSummary = this.buildCheckoutSummary(listing, setup, version);

    return {
      order: {
        ...orderSummary,
        acceptedLicense: true,
        acceptedVinPolicy: true,
        compatibilityStatus: compatibility.status,
        createdAt: Date.now()
      }
    };
  }

  createVersion(tunerUserId: string, listingId: string, input: CreateListingVersionInput): ListingVersionRecord {
    const listing = this.getOwnedListing(tunerUserId, listingId);
    const semanticLabel = input.semanticLabel?.trim();
    const changelogNotes = input.changelogNotes?.trim();

    if (!semanticLabel || !this.isSemanticLabel(semanticLabel)) {
      throw new BadRequestException("Semantic label is required and must be versioned");
    }

    if (!changelogNotes) {
      throw new BadRequestException("Changelog notes are required");
    }

    const version: ListingVersionRecord = {
      id: randomUUID(),
      listingId: listing.id,
      semanticLabel,
      changelogNotes,
      createdAt: Date.now()
    };

    const versions = this.versionsByListingId.get(listing.id) ?? [];
    this.versionsByListingId.set(listing.id, [version, ...versions]);
    return version;
  }

  getListingDetail(userId: string, listingId: string): {
    listing: ListingRecord;
    versionHistory: ListingVersionRecord[];
  } {
    const listing = this.getListingById(listingId);
    const versionHistory = this.getVersionHistory(listingId);

    if (listing.publishStatus !== "published" && listing.tunerUserId !== userId) {
      throw new ForbiddenException("Listing ownership required");
    }

    return {
      listing,
      versionHistory
    };
  }

  createEntitlement(userId: string, listingId: string, input: CreateEntitlementInput): EntitlementRecord {
    this.getListingById(listingId);
    const selectedVersion = this.resolveVersion(listingId, input.versionId);

    const entitlement: EntitlementRecord = {
      id: randomUUID(),
      listingId,
      userId,
      versionId: selectedVersion.id,
      createdAt: Date.now(),
      upgradedAt: null
    };

    this.entitlementsById.set(entitlement.id, entitlement);
    return entitlement;
  }

  upgradeEntitlement(userId: string, entitlementId: string, versionId: string): EntitlementRecord {
    const entitlement = this.getOwnedEntitlement(userId, entitlementId);
    const version = this.resolveVersion(entitlement.listingId, versionId);

    entitlement.versionId = version.id;
    entitlement.upgradedAt = Date.now();
    return entitlement;
  }

  getDownloadPage(userId: string, entitlementId: string): {
    download: {
      entitlementId: string;
      listingId: string;
      versionId: string;
      semanticLabel: string;
      versionTimestamp: number;
    };
  } {
    const entitlement = this.getOwnedEntitlement(userId, entitlementId);
    const version = this.resolveVersion(entitlement.listingId, entitlement.versionId);

    return {
      download: {
        entitlementId: entitlement.id,
        listingId: entitlement.listingId,
        versionId: version.id,
        semanticLabel: version.semanticLabel,
        versionTimestamp: version.createdAt
      }
    };
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
    const listing = this.getListingById(listingId);
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    if (listing.tunerUserId !== tunerUserId) {
      throw new ForbiddenException("Listing ownership required");
    }

    return listing;
  }

  private getListingById(listingId: string): ListingRecord {
    const listing = this.listingsById.get(listingId);
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    return listing;
  }

  private getVersionHistory(listingId: string): ListingVersionRecord[] {
    return [...(this.versionsByListingId.get(listingId) ?? [])];
  }

  private resolveVersion(listingId: string, versionId?: string): ListingVersionRecord {
    const versions = this.versionsByListingId.get(listingId) ?? [];

    if (versions.length === 0) {
      throw new BadRequestException("Listing has no versions");
    }

    if (!versionId) {
      return versions[0];
    }

    const version = versions.find((candidate) => candidate.id === versionId);
    if (!version) {
      throw new NotFoundException("Version not found");
    }

    return version;
  }

  private buildCheckoutSummary(
    listing: ListingRecord,
    setup: { id: string; make: string; model: string; engine: string; ecuId: string; transmission: string; fuelType: string; installedMods: string[] },
    version: ListingVersionRecord
  ): CheckoutSummary {
    return {
      listing: {
        id: listing.id,
        title: listing.title,
        stage: listing.stage,
        priceAmount: listing.priceAmount,
        priceCurrency: listing.priceCurrency
      },
      setup: {
        id: setup.id,
        make: setup.make,
        model: setup.model,
        engine: setup.engine,
        ecuId: setup.ecuId,
        transmission: setup.transmission,
        fuelType: setup.fuelType,
        installedMods: setup.installedMods
      },
      versionId: version.id,
      semanticLabel: version.semanticLabel,
      versionTimestamp: version.createdAt
    };
  }

  private getOwnedEntitlement(userId: string, entitlementId: string): EntitlementRecord {
    const entitlement = this.entitlementsById.get(entitlementId);
    if (!entitlement) {
      throw new NotFoundException("Entitlement not found");
    }

    if (entitlement.userId !== userId) {
      throw new ForbiddenException("Entitlement ownership required");
    }

    return entitlement;
  }

  private isSemanticLabel(semanticLabel: string): boolean {
    return /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(semanticLabel);
  }

  private appendModerationEvent(listingId: string, event: ModerationEventRecord): void {
    const events = this.moderationEventsByListingId.get(listingId) ?? [];
    this.moderationEventsByListingId.set(listingId, [...events, event]);
  }

  private appendNotification(userId: string, notification: NotificationRecord): void {
    const notifications = this.notificationsByUserId.get(userId) ?? [];
    this.notificationsByUserId.set(userId, [...notifications, notification]);
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
