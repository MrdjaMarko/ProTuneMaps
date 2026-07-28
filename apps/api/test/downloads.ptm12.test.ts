import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-12 Signed download links, checksum, and download audit log", () => {
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

  it("shows checksum and signed download links, then logs granted and denied download access", async () => {
    const tuner = await signupAndLogin("ptm12-tuner@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "BMW M340i Stage 2 v1.2.0",
        stage: "Stage 2",
        priceAmount: 399,
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
        semanticLabel: "v1.2.0",
        changelogNotes: "Adds signed downloads and checksum metadata."
      });

    expect(version.statusCode).toBe(201);

    const buyer = await signupAndLogin("ptm12-buyer@example.com");
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
        idempotencyKey: "ptm12-payment-001"
      });

    expect(payment.statusCode).toBe(201);

    const page = await request(app.getHttpServer())
      .get(`/v1/downloads/${payment.body.entitlement.id}`)
      .set("Cookie", buyer.cookie);

    expect(page.statusCode).toBe(200);
    expect(page.body.download.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(page.body.download.signedUrl).toContain("signature=");
    expect(page.body.download.signedUrl).toContain("expiresAt=");
    expect(page.body.download.orderId).toBe(payment.body.order.id);

    const granted = await request(app.getHttpServer())
      .get(page.body.download.signedUrl)
      .set("Cookie", buyer.cookie);

    expect(granted.statusCode).toBe(200);
    expect(granted.body.download.checksum).toBe(page.body.download.checksum);
    expect(granted.body.download.versionId).toBe(payment.body.entitlement.versionId);
    expect(granted.body.download.orderId).toBe(payment.body.order.id);

    const denied = await request(app.getHttpServer())
      .get(page.body.download.signedUrl.replace(/expiresAt=\d+/, "expiresAt=1"))
      .set("Cookie", buyer.cookie);

    expect(denied.statusCode).toBe(403);

    const audit = await request(app.getHttpServer())
      .get(`/v1/downloads/${payment.body.entitlement.id}/audit`)
      .set("Cookie", buyer.cookie);

    expect(audit.statusCode).toBe(200);
    expect(audit.body.events.length).toBeGreaterThanOrEqual(2);
    expect(audit.body.events.at(-1).outcome).toBe("denied");
    expect(audit.body.events[0].orderId).toBe(payment.body.order.id);
    expect(audit.body.events[0].userId).toBe(buyer.userId);
    expect(audit.body.events[0].versionId).toBe(payment.body.entitlement.versionId);
  });
});
