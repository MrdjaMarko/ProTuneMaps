import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  CompatibilityService,
  type CompatibilityStatus,
  type CompatibilityResult,
  type ListingRequirements
} from "../compatibility/compatibility.service";
import { TunerService } from "../tuner/tuner.service";
import { VehicleSetupsService } from "../vehicle-setups/vehicle-setups.service";

export interface ListingRecord {
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

export interface ListingVersionRecord {
  id: string;
  listingId: string;
  semanticLabel: string;
  changelogNotes: string;
  createdAt: number;
}

export interface EntitlementRecord {
  id: string;
  listingId: string;
  userId: string;
  versionId: string;
  orderId: string | null;
  createdAt: number;
  upgradedAt: number | null;
}

export interface ModerationEventRecord {
  id: string;
  listingId: string;
  action: "unpublish" | "republish";
  reason: string;
  actorUserId: string;
  createdAt: number;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  listingId: string;
  message: string;
  createdAt: number;
}

export interface DownloadAuditRecord {
  id: string;
  entitlementId: string;
  listingId: string;
  orderId: string | null;
  userId: string;
  versionId: string;
  outcome: "granted" | "denied";
  reason: string;
  createdAt: number;
}

export interface CreateListingInput {
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

export interface MarketplaceSearchQuery {
  setupId: string;
  make?: string;
  model?: string;
  engine?: string;
  fuelType?: string;
  stage?: string;
  sort?: "relevance" | "newest";
}

export interface PublishedMapCard {
  id: string;
  title: string;
  stage: string;
  priceAmount: number;
  priceCurrency: string;
}

export interface UpdateListingInput {
  title?: string;
  stage?: string;
  priceAmount?: number;
  priceCurrency?: string;
  dynoImages?: string[];
  evidenceNotes?: string;
  knownLimitations?: string;
  requirements?: Partial<ListingRequirements>;
}

export interface CreateListingVersionInput {
  semanticLabel?: string;
  changelogNotes?: string;
}

export interface CreateEntitlementInput {
  versionId?: string;
  orderId?: string | null;
}

export interface CheckoutPreviewInput {
  setupId?: string;
}

export interface CheckoutAttemptInput {
  setupId?: string;
  acceptedLicense?: boolean;
  acceptedVinPolicy?: boolean;
}

export interface PaymentAttemptInput {
  setupId?: string;
  acceptedLicense?: boolean;
  acceptedVinPolicy?: boolean;
  idempotencyKey?: string;
  simulateFailure?: boolean;
}

export interface CheckoutSummary {
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

export interface DownloadLinkInput {
  expiresAt?: string;
  signature?: string;
}

export interface DownloadPageRecord {
  entitlementId: string;
  listingId: string;
  orderId: string | null;
  versionId: string;
  semanticLabel: string;
  versionTimestamp: number;
  checksum: string;
  signedUrl: string;
  expiresAt: number;
}

export interface DownloadResponseRecord extends DownloadPageRecord {
  downloadedAt: number;
}

export interface OrderRecord {
  id: string;
  listingId: string;
  userId: string;
  paymentId: string;
  entitlementId: string | null;
  versionId: string;
  semanticLabel: string;
  versionTimestamp: number;
  setup: CheckoutSummary["setup"];
  status: "created" | "failed";
  createdAt: number;
}

export interface OrderHistoryEntry {
  orderId: string;
  listingId: string;
  versionId: string;
  semanticLabel: string;
  status: "created" | "failed";
  createdAt: number;
  setupSnapshot: CheckoutSummary["setup"];
  downloadCenter: {
    available: boolean;
    error?: string;
    downloadPage?: DownloadPageRecord;
  };
}

export interface OrderHistoryResponse {
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
  orders: OrderHistoryEntry[];
}

export type SupportTicketIssueType = "install" | "drivability" | "performance" | "refund";

export type SupportTicketStatus = "Open" | "Waiting on Buyer" | "Resolved" | "Closed";

export interface SupportTicketRecord {
  id: string;
  orderId: string;
  listingId: string;
  tunerUserId: string;
  userId: string;
  versionId: string;
  setupSnapshot: CheckoutSummary["setup"];
  issueType: SupportTicketIssueType;
  message: string;
  status: SupportTicketStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreateSupportTicketInput {
  issueType?: SupportTicketIssueType;
  message?: string;
}

export interface UpdateSupportTicketInput {
  status?: SupportTicketStatus;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  listingId: string;
  userId: string;
  status: "succeeded" | "failed";
  idempotencyKey: string;
  failureReason: string | null;
  createdAt: number;
}

export interface PaymentAuditRecord {
  id: string;
  orderId: string;
  paymentId: string;
  actorUserId: string;
  outcome: "succeeded" | "failed";
  createdAt: number;
  note: string;
}

export interface PaymentAttemptResult {
  payment: PaymentRecord;
  order: OrderRecord;
  entitlement?: EntitlementRecord;
  replayed: boolean;
}

@Injectable()
export class ListingsService {
  private readonly listingsById = new Map<string, ListingRecord>();
  private readonly versionsByListingId = new Map<string, ListingVersionRecord[]>();
  private readonly entitlementsById = new Map<string, EntitlementRecord>();
  private readonly ordersById = new Map<string, OrderRecord>();
  private readonly paymentsById = new Map<string, PaymentRecord>();
  private readonly paymentResultsByIdempotencyKey = new Map<string, PaymentAttemptResult>();
  private readonly paymentAuditsByOrderId = new Map<string, PaymentAuditRecord[]>();
  private readonly downloadAuditsByEntitlementId = new Map<string, DownloadAuditRecord[]>();
  private readonly supportTicketsById = new Map<string, SupportTicketRecord>();
  private readonly moderationEventsByListingId = new Map<string, ModerationEventRecord[]>();
  private readonly notificationsByUserId = new Map<string, NotificationRecord[]>();
  private readonly downloadLinkTtlMs = 15 * 60 * 1000;
  private readonly downloadSigningSecret = "protunemaps-download-link-secret";

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

  processPayment(userId: string, listingId: string, input: PaymentAttemptInput): PaymentAttemptResult {
    const idempotencyKey = input.idempotencyKey?.trim();

    if (!idempotencyKey) {
      throw new BadRequestException("Idempotency key is required");
    }

    const cachedResult = this.paymentResultsByIdempotencyKey.get(idempotencyKey);
    if (cachedResult) {
      return {
        ...cachedResult,
        replayed: true
      };
    }

    const orderDraft = this.attemptCheckout(userId, listingId, {
      setupId: input.setupId,
      acceptedLicense: input.acceptedLicense,
      acceptedVinPolicy: input.acceptedVinPolicy
    }).order;

    const paymentCreatedAt = Date.now();
    const order: OrderRecord = {
      id: randomUUID(),
      listingId,
      userId,
      paymentId: "",
      entitlementId: null,
      versionId: orderDraft.versionId,
      semanticLabel: orderDraft.semanticLabel,
      versionTimestamp: orderDraft.versionTimestamp,
      setup: orderDraft.setup,
      status: input.simulateFailure ? "failed" : "created",
      createdAt: paymentCreatedAt
    };

    const payment: PaymentRecord = {
      id: randomUUID(),
      orderId: order.id,
      listingId,
      userId,
      status: input.simulateFailure ? "failed" : "succeeded",
      idempotencyKey,
      failureReason: input.simulateFailure ? "Simulated payment failure" : null,
      createdAt: paymentCreatedAt
    };

    order.paymentId = payment.id;

    let entitlement: EntitlementRecord | undefined;

    if (payment.status === "succeeded") {
      entitlement = this.createEntitlement(userId, listingId, { versionId: order.versionId, orderId: order.id });
      order.entitlementId = entitlement.id;
      this.appendNotification(userId, {
        id: randomUUID(),
        userId,
        listingId,
        message: `Payment confirmation email sent for order ${order.id}`,
        createdAt: paymentCreatedAt
      });
    }

    this.ordersById.set(order.id, order);
    this.paymentsById.set(payment.id, payment);

    const auditRecord: PaymentAuditRecord = {
      id: randomUUID(),
      orderId: order.id,
      paymentId: payment.id,
      actorUserId: userId,
      outcome: payment.status,
      createdAt: paymentCreatedAt,
      note: payment.status === "succeeded" ? "Payment authorized and entitlement issued" : "Payment failed before entitlement issuance"
    };

    this.appendPaymentAudit(order.id, auditRecord);

    const result: PaymentAttemptResult = {
      payment,
      order,
      entitlement,
      replayed: false
    };

    this.paymentResultsByIdempotencyKey.set(idempotencyKey, result);
    return result;
  }

  getOrder(userId: string, orderId: string): {
    order: OrderRecord;
  } {
    const order = this.ordersById.get(orderId);
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (order.userId !== userId) {
      throw new ForbiddenException("Order ownership required");
    }

    return { order };
  }

  getOrderHistory(userId: string, pageInput?: string, limitInput?: string): OrderHistoryResponse {
    const page = this.parsePositiveInteger(pageInput, 1);
    const limit = this.parsePositiveInteger(limitInput, 10);

    if (page < 1) {
      throw new BadRequestException("Page must be at least 1");
    }

    if (limit < 1 || limit > 50) {
      throw new BadRequestException("Limit must be between 1 and 50");
    }

    const userOrders = [...this.ordersById.values()]
      .filter((order) => order.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));

    const totalItems = userOrders.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const startIndex = (page - 1) * limit;
    const pageOrders = userOrders.slice(startIndex, startIndex + limit);

    return {
      pagination: {
        page,
        limit,
        totalItems,
        totalPages
      },
      orders: pageOrders.map((order) => this.buildOrderHistoryEntry(userId, order))
    };
  }

  createSupportTicket(userId: string, orderId: string, input: CreateSupportTicketInput): {
    ticket: SupportTicketRecord;
  } {
    const order = this.getOrder(userId, orderId).order;

    if (!order.entitlementId) {
      throw new ForbiddenException("Only purchasers can open map-specific tickets");
    }

    const issueType = input.issueType;
    if (!issueType || !["install", "drivability", "performance", "refund"].includes(issueType)) {
      throw new BadRequestException("Issue type is required");
    }

    const listing = this.getListingById(order.listingId);
    const now = Date.now();
    const ticket: SupportTicketRecord = {
      id: randomUUID(),
      orderId: order.id,
      listingId: listing.id,
      tunerUserId: listing.tunerUserId,
      userId,
      versionId: order.versionId,
      setupSnapshot: order.setup,
      issueType,
      message: input.message?.trim() || "",
      status: "Open",
      createdAt: now,
      updatedAt: now
    };

    this.supportTicketsById.set(ticket.id, ticket);
    this.appendNotification(listing.tunerUserId, {
      id: randomUUID(),
      userId: listing.tunerUserId,
      listingId: listing.id,
      message: `New support ticket ${ticket.id} for order ${order.id}`,
      createdAt: now
    });

    return { ticket };
  }

  updateSupportTicket(userId: string, ticketId: string, input: UpdateSupportTicketInput): {
    ticket: SupportTicketRecord;
  } {
    const ticket = this.supportTicketsById.get(ticketId);
    if (!ticket) {
      throw new NotFoundException("Support ticket not found");
    }

    if (ticket.userId !== userId) {
      throw new ForbiddenException("Ticket ownership required");
    }

    const nextStatus = input.status;
    if (!nextStatus || !["Open", "Waiting on Buyer", "Resolved", "Closed"].includes(nextStatus)) {
      throw new BadRequestException("Status is required");
    }

    ticket.status = nextStatus;
    ticket.updatedAt = Date.now();

    return { ticket };
  }

  getOrderAudit(userId: string, orderId: string): {
    events: PaymentAuditRecord[];
  } {
    const order = this.ordersById.get(orderId);
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (order.userId !== userId) {
      throw new ForbiddenException("Order ownership required");
    }

    return {
      events: [...(this.paymentAuditsByOrderId.get(orderId) ?? [])]
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
      orderId: input.orderId ?? null,
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
    download: DownloadPageRecord;
  } {
    const entitlement = this.getOwnedEntitlement(userId, entitlementId);
    const version = this.resolveVersion(entitlement.listingId, entitlement.versionId);
    const listing = this.getListingById(entitlement.listingId);
    const order = this.getOrderByEntitlementId(entitlement.id);
    const expiresAt = Date.now() + this.downloadLinkTtlMs;
    const checksum = this.buildDownloadChecksum(listing, version, entitlement, order?.id ?? null);

    return {
      download: {
        entitlementId: entitlement.id,
        listingId: entitlement.listingId,
        orderId: order?.id ?? entitlement.orderId,
        versionId: version.id,
        semanticLabel: version.semanticLabel,
        versionTimestamp: version.createdAt,
        checksum,
        signedUrl: this.buildSignedDownloadUrl(entitlement.id, expiresAt),
        expiresAt
      }
    };
  }

  accessDownload(userId: string, entitlementId: string, input: DownloadLinkInput): {
    download: DownloadResponseRecord;
  } {
    const entitlement = this.getOwnedEntitlement(userId, entitlementId);
    const version = this.resolveVersion(entitlement.listingId, entitlement.versionId);
    const listing = this.getListingById(entitlement.listingId);
    const order = this.getOrderByEntitlementId(entitlement.id);
    const parsedExpiresAt = Number(input.expiresAt);
    const signature = (input.signature ?? "").trim();
    const now = Date.now();

    if (!signature || Number.isNaN(parsedExpiresAt) || parsedExpiresAt < now) {
      this.appendDownloadAudit(entitlement, order?.id ?? entitlement.orderId, version.id, userId, "denied", "Download link expired or missing signature");
      throw new ForbiddenException("Download link is invalid or expired");
    }

    const expectedSignature = this.signDownloadLink(entitlement.id, parsedExpiresAt);
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const providedBuffer = Buffer.from(signature, "hex");

    if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
      this.appendDownloadAudit(entitlement, order?.id ?? entitlement.orderId, version.id, userId, "denied", "Download link signature mismatch");
      throw new ForbiddenException("Download link is invalid or expired");
    }

    const checksum = this.buildDownloadChecksum(listing, version, entitlement, order?.id ?? null);
    this.appendDownloadAudit(entitlement, order?.id ?? entitlement.orderId, version.id, userId, "granted", "Download link validated");

    return {
      download: {
        entitlementId: entitlement.id,
        listingId: entitlement.listingId,
        orderId: order?.id ?? entitlement.orderId,
        versionId: version.id,
        semanticLabel: version.semanticLabel,
        versionTimestamp: version.createdAt,
        checksum,
        signedUrl: this.buildSignedDownloadUrl(entitlement.id, parsedExpiresAt),
        expiresAt: parsedExpiresAt,
        downloadedAt: now
      }
    };
  }

  getDownloadAudit(userId: string, entitlementId: string): {
    events: DownloadAuditRecord[];
  } {
    const entitlement = this.getOwnedEntitlement(userId, entitlementId);
    return {
      events: [...(this.downloadAuditsByEntitlementId.get(entitlement.id) ?? [])]
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
      const latestVersion = versions[0];
      if (!latestVersion) {
        throw new BadRequestException("Listing has no versions");
      }

      return latestVersion;
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

  private appendPaymentAudit(orderId: string, event: PaymentAuditRecord): void {
    const events = this.paymentAuditsByOrderId.get(orderId) ?? [];
    this.paymentAuditsByOrderId.set(orderId, [...events, event]);
  }

  private appendDownloadAudit(
    entitlement: EntitlementRecord,
    orderId: string | null,
    versionId: string,
    userId: string,
    outcome: "granted" | "denied",
    reason: string
  ): void {
    const events = this.downloadAuditsByEntitlementId.get(entitlement.id) ?? [];
    const record: DownloadAuditRecord = {
      id: randomUUID(),
      entitlementId: entitlement.id,
      listingId: entitlement.listingId,
      orderId,
      userId,
      versionId,
      outcome,
      reason,
      createdAt: Date.now()
    };

    this.downloadAuditsByEntitlementId.set(entitlement.id, [...events, record]);
  }

  private buildDownloadChecksum(
    listing: ListingRecord,
    version: ListingVersionRecord,
    entitlement: EntitlementRecord,
    orderId: string | null
  ): string {
    return createHash("sha256")
      .update([listing.id, version.id, version.semanticLabel, version.createdAt, entitlement.id, orderId ?? ""].join("|"))
      .digest("hex");
  }

  private buildSignedDownloadUrl(entitlementId: string, expiresAt: number): string {
    const signature = this.signDownloadLink(entitlementId, expiresAt);
    return `/v1/downloads/${entitlementId}/file?expiresAt=${expiresAt}&signature=${signature}`;
  }

  private signDownloadLink(entitlementId: string, expiresAt: number): string {
    return createHmac("sha256", this.downloadSigningSecret).update(`${entitlementId}:${expiresAt}`).digest("hex");
  }

  private getOrderByEntitlementId(entitlementId: string): OrderRecord | null {
    return [...this.ordersById.values()].find((order) => order.entitlementId === entitlementId) ?? null;
  }

  private buildOrderHistoryEntry(userId: string, order: OrderRecord): OrderHistoryEntry {
    const entitlement = order.entitlementId ? this.entitlementsById.get(order.entitlementId) ?? null : null;

    if (entitlement) {
      const downloadPage = this.getDownloadPage(userId, entitlement.id).download;
      return {
        orderId: order.id,
        listingId: order.listingId,
        versionId: order.versionId,
        semanticLabel: order.semanticLabel,
        status: order.status,
        createdAt: order.createdAt,
        setupSnapshot: order.setup,
        downloadCenter: {
          available: true,
          downloadPage
        }
      };
    }

    return {
      orderId: order.id,
      listingId: order.listingId,
      versionId: order.versionId,
      semanticLabel: order.semanticLabel,
      status: order.status,
      createdAt: order.createdAt,
      setupSnapshot: order.setup,
      downloadCenter: {
        available: false,
        error: order.status === "failed" ? "No entitlement available for this failed order" : "No entitlement linked to this order"
      }
    };
  }

  private parsePositiveInteger(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      return fallback;
    }

    return parsed;
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
