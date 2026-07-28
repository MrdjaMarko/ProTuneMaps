import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-11 Payment events and order entitlement", () => {
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

  it("creates order and entitlement records on successful payment and is idempotent", async () => {
    const tuner = await signupAndLogin("ptm11-tuner1@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "BMW M340i Stage 2 v1.0.0",
        stage: "Stage 2",
        priceAmount: 350,
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
      .set("Cookie", tuner.cookie)
      .send({
        semanticLabel: "v1.0.0",
        changelogNotes: "Initial release with safe fuel and torque calibration."
      });

    expect(version.statusCode).toBe(201);

    const buyer = await signupAndLogin("ptm11-buyer1@example.com");
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

    const preview = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/checkout-preview`)
      .set("Cookie", buyer.cookie)
      .send({ setupId: setup.body.setup.id });

    expect(preview.statusCode).toBe(200);
    expect(preview.body.orderSummary.semanticLabel).toBe("v1.0.0");

    const payment = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/payments`)
      .set("Cookie", buyer.cookie)
      .send({
        setupId: setup.body.setup.id,
        acceptedLicense: true,
        acceptedVinPolicy: true,
        idempotencyKey: "ptm11-payment-001"
      });

    expect(payment.statusCode).toBe(201);
    expect(payment.body.payment.status).toBe("succeeded");
    expect(payment.body.order.status).toBe("created");
    expect(payment.body.entitlement.versionId).toBe(version.body.version.id);
    expect(payment.body.order.semanticLabel).toBe("v1.0.0");
    expect(payment.body.order.setup.make).toBe("BMW");

    const repeated = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/payments`)
      .set("Cookie", buyer.cookie)
      .send({
        setupId: setup.body.setup.id,
        acceptedLicense: true,
        acceptedVinPolicy: true,
        idempotencyKey: "ptm11-payment-001"
      });

    expect(repeated.statusCode).toBe(200);
    expect(repeated.body.payment.id).toBe(payment.body.payment.id);
    expect(repeated.body.entitlement.id).toBe(payment.body.entitlement.id);

    const orderLookup = await request(app.getHttpServer())
      .get(`/v1/orders/${payment.body.order.id}`)
      .set("Cookie", buyer.cookie);

    expect(orderLookup.statusCode).toBe(200);
    expect(orderLookup.body.order.id).toBe(payment.body.order.id);
    expect(orderLookup.body.order.listingId).toBe(listing.body.listing.id);
    expect(orderLookup.body.order.entitlementId).toBe(payment.body.entitlement.id);
    expect(orderLookup.body.order.paymentId).toBe(payment.body.payment.id);

    const notifications = await request(app.getHttpServer())
      .get("/v1/notifications")
      .set("Cookie", buyer.cookie);

    expect(notifications.statusCode).toBe(200);
    expect(notifications.body.notifications.some((entry: { type?: string; message: string }) => entry.message.includes("confirmation"))).toBe(true);
  });

  it("creates no entitlement record on failed payment and logs the failure", async () => {
    const tuner = await signupAndLogin("ptm11-tuner2@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Audi RS3 Stage 1 v1.0.0",
        stage: "Stage 1",
        priceAmount: 199,
        priceCurrency: "EUR",
        requirements: {
          make: "Audi",
          model: "RS3",
          engine: "DAZA",
          ecuId: "SIMOS18",
          fuelType: "98 RON",
          requiredMods: []
        }
      });

    const version = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/versions`)
      .set("Cookie", tuner.cookie)
      .send({
        semanticLabel: "v1.0.0",
        changelogNotes: "Stable initial release."
      });

    const buyer = await signupAndLogin("ptm11-buyer2@example.com");
    const setup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "Audi",
        model: "RS3",
        year: 2022,
        engine: "DAZA",
        ecuId: "SIMOS18",
        transmission: "DCT",
        fuelType: "98 RON",
        installedMods: []
      });

    const payment = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/payments`)
      .set("Cookie", buyer.cookie)
      .send({
        setupId: setup.body.setup.id,
        acceptedLicense: true,
        acceptedVinPolicy: true,
        idempotencyKey: "ptm11-payment-fail",
        simulateFailure: true
      });

    expect(payment.statusCode).toBe(402);
    expect(payment.body.payment.status).toBe("failed");
    expect(payment.body.entitlement).toBeUndefined();

    const audit = await request(app.getHttpServer())
      .get(`/v1/orders/${payment.body.payment.orderId}/audit`)
      .set("Cookie", buyer.cookie);

    expect(audit.statusCode).toBe(200);
    expect(audit.body.events.some((entry: { outcome: string }) => entry.outcome === "failed")).toBe(true);
  });
});
