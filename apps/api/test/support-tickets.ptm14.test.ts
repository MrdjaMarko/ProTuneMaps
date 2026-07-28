import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-14 Support ticket creation tied to order/setup/version", () => {
  let app: NestFastifyApplication;
  let authService: AuthService;

  beforeAll(async () => {
    app = await createApp();
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function signupAndLogin(email: string) {
    const signup = await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email, password: "Passw0rd!" });

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email, password: "Passw0rd!" });

    return {
      userId: signup.body.user.id as string,
      cookie: login.headers["set-cookie"]?.[0] as string
    };
  }

  async function createPurchasedOrder(
    tunerCookie: string,
    buyerEmail = "ptm14-buyer@example.com",
    idempotencyKey = "ptm14-payment-001"
  ) {
    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tunerCookie)
      .send({
        title: "BMW M340i Support v1.0.0",
        stage: "Stage 2",
        priceAmount: 320,
        priceCurrency: "EUR",
        requirements: {
          make: "BMW",
          model: "M340i",
          engine: "B58",
          ecuId: "MEVD172G",
          fuelType: "98 RON",
          requiredMods: ["Downpipe"]
        }
      });

    const version = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/versions`)
      .set("Cookie", tunerCookie)
      .send({
        semanticLabel: "v1.0.0",
        changelogNotes: "Initial release for support ticket coverage."
      });

    const buyer = await signupAndLogin(buyerEmail);
    const setup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "BMW",
        model: "M340i",
        year: 2021,
        engine: "B58",
        ecuId: "MEVD172G",
        transmission: "AT",
        fuelType: "98 RON",
        installedMods: ["Downpipe"]
      });

    const payment = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/payments`)
      .set("Cookie", buyer.cookie)
      .send({
        setupId: setup.body.setup.id,
        acceptedLicense: true,
        acceptedVinPolicy: true,
        idempotencyKey
      });

    expect(payment.statusCode).toBe(201);

    return {
      buyer,
      listingId: listing.body.listing.id as string,
      versionId: version.body.version.id as string,
      setupId: setup.body.setup.id as string,
      orderId: payment.body.order.id as string,
      entitlementId: payment.body.entitlement.id as string
    };
  }

  it("auto-attaches order, setup, and version to a ticket, notifies the tuner, and supports status lifecycle", async () => {
    const tuner = await signupAndLogin("ptm14-tuner@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const purchase = await createPurchasedOrder(tuner.cookie, "ptm14-buyer-2@example.com", "ptm14-payment-002");

    const ticket = await request(app.getHttpServer())
      .post(`/v1/orders/${purchase.orderId}/support-tickets`)
      .set("Cookie", purchase.buyer.cookie)
      .send({
        issueType: "drivability",
        message: "The car hesitates at partial throttle after the flash."
      });

    expect(ticket.statusCode).toBe(201);
    expect(ticket.body.ticket.orderId).toBe(purchase.orderId);
    expect(ticket.body.ticket.listingId).toBe(purchase.listingId);
    expect(ticket.body.ticket.versionId).toBe(purchase.versionId);
    expect(ticket.body.ticket.setupSnapshot.id).toBe(purchase.setupId);
    expect(ticket.body.ticket.issueType).toBe("drivability");
    expect(ticket.body.ticket.status).toBe("Open");

    const notifications = await request(app.getHttpServer())
      .get("/v1/notifications")
      .set("Cookie", tuner.cookie);

    expect(notifications.statusCode).toBe(200);
    expect(notifications.body.notifications.some((entry: { message: string }) => entry.message.includes(purchase.orderId))).toBe(true);

    const waiting = await request(app.getHttpServer())
      .patch(`/v1/support-tickets/${ticket.body.ticket.id}`)
      .set("Cookie", purchase.buyer.cookie)
      .send({ status: "Waiting on Buyer" });

    expect(waiting.statusCode).toBe(200);
    expect(waiting.body.ticket.status).toBe("Waiting on Buyer");

    const resolved = await request(app.getHttpServer())
      .patch(`/v1/support-tickets/${ticket.body.ticket.id}`)
      .set("Cookie", purchase.buyer.cookie)
      .send({ status: "Resolved" });

    expect(resolved.statusCode).toBe(200);
    expect(resolved.body.ticket.status).toBe("Resolved");

    const closed = await request(app.getHttpServer())
      .patch(`/v1/support-tickets/${ticket.body.ticket.id}`)
      .set("Cookie", purchase.buyer.cookie)
      .send({ status: "Closed" });

    expect(closed.statusCode).toBe(200);
    expect(closed.body.ticket.status).toBe("Closed");
    expect(closed.body.ticket.updatedAt).toBeGreaterThanOrEqual(closed.body.ticket.createdAt);
  });

  it("denies non-purchasers from opening map-specific tickets", async () => {
    const tuner = await signupAndLogin("ptm14-tuner-2@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const purchase = await createPurchasedOrder(tuner.cookie);
    const outsider = await signupAndLogin("ptm14-outsider-2@example.com");

    const ticket = await request(app.getHttpServer())
      .post(`/v1/orders/${purchase.orderId}/support-tickets`)
      .set("Cookie", outsider.cookie)
      .send({
        issueType: "install",
        message: "I did not buy this map but want help."
      });

    expect(ticket.statusCode).toBe(403);
  });
});
