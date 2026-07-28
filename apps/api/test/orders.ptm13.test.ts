import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-13 Order history and download center", () => {
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

  async function createListingAndVersion(tunerCookie: string, title: string, stage: string) {
    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tunerCookie)
      .send({
        title,
        stage,
        priceAmount: 250,
        priceCurrency: "EUR",
        requirements: {
          make: "BMW",
          model: "M340i",
          engine: "B58",
          ecuId: "MEVD172G",
          fuelType: "98 RON",
          requiredMods: []
        }
      });

    const version = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/versions`)
      .set("Cookie", tunerCookie)
      .send({
        semanticLabel: "v1.0.0",
        changelogNotes: `Initial release for ${title}.`
      });

    return {
      listingId: listing.body.listing.id as string,
      versionId: version.body.version.id as string
    };
  }

  it("lists orders with pagination and exposes download availability per order", async () => {
    const tuner = await signupAndLogin("ptm13-tuner@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const listing = await createListingAndVersion(tuner.cookie, "BMW M340i Order Center v1.0.0", "Stage 1");

    const buyer = await signupAndLogin("ptm13-buyer@example.com");
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
        installedMods: []
      });

    const successfulPayment = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.listingId}/payments`)
      .set("Cookie", buyer.cookie)
      .send({
        setupId: setup.body.setup.id,
        acceptedLicense: true,
        acceptedVinPolicy: true,
        idempotencyKey: "ptm13-order-success"
      });

    expect(successfulPayment.statusCode).toBe(201);

    const failedPayment = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.listingId}/payments`)
      .set("Cookie", buyer.cookie)
      .send({
        setupId: setup.body.setup.id,
        acceptedLicense: true,
        acceptedVinPolicy: true,
        idempotencyKey: "ptm13-order-failure",
        simulateFailure: true
      });

    expect(failedPayment.statusCode).toBe(402);

    const pageOne = await request(app.getHttpServer())
      .get("/v1/orders?page=1&limit=1")
      .set("Cookie", buyer.cookie);

    expect(pageOne.statusCode).toBe(200);
    expect(pageOne.body.pagination.page).toBe(1);
    expect(pageOne.body.pagination.limit).toBe(1);
    expect(pageOne.body.pagination.totalItems).toBe(2);
    expect(pageOne.body.pagination.totalPages).toBe(2);
    expect(pageOne.body.orders).toHaveLength(1);
    expect(pageOne.body.orders[0].listingId).toBe(listing.listingId);
    expect(pageOne.body.orders[0].versionId).toBe(listing.versionId);
    expect(pageOne.body.orders[0].setupSnapshot.make).toBe("BMW");
    expect(pageOne.body.orders[0].downloadCenter.available).toBe(false);
    expect(pageOne.body.orders[0].downloadCenter.error).toContain("entitlement");

    const pageTwo = await request(app.getHttpServer())
      .get("/v1/orders?page=2&limit=1")
      .set("Cookie", buyer.cookie);

    expect(pageTwo.statusCode).toBe(200);
    expect(pageTwo.body.pagination.page).toBe(2);
    expect(pageTwo.body.orders).toHaveLength(1);
    expect(pageTwo.body.orders[0].orderId).toBe(successfulPayment.body.order.id);
    expect(pageTwo.body.orders[0].downloadCenter.available).toBe(true);
    expect(pageTwo.body.orders[0].downloadCenter.downloadPage.entitlementId).toBe(successfulPayment.body.entitlement.id);
    expect(pageTwo.body.orders[0].downloadCenter.downloadPage.signedUrl).toContain("signature=");
  });
});
