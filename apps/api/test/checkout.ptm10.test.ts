import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-10 Checkout with compatibility gate and terms acceptance", () => {
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

  it("revalidates compatibility before payment and blocks checkout when terms are unchecked", async () => {
    const tuner = await signupAndLogin("ptm10-tuner1@example.com");
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

    const buyer = await signupAndLogin("ptm10-buyer1@example.com");
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
    expect(preview.body.purchaseButtonDisabled).toBe(false);
    expect(preview.body.orderSummary.semanticLabel).toBe("v1.0.0");
    expect(preview.body.orderSummary.setup.make).toBe("BMW");
    expect(preview.body.orderSummary.setup.model).toBe("M340i");
    expect(preview.body.orderSummary.setup.engine).toBe("B58");
    expect(preview.body.orderSummary.setup.fuelType).toBe("98 RON");
    expect(preview.body.orderSummary.listing.title).toBe(listing.body.listing.title);

    const blockedTerms = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/checkout`)
      .set("Cookie", buyer.cookie)
      .send({ setupId: setup.body.setup.id, acceptedLicense: true, acceptedVinPolicy: false });

    expect(blockedTerms.statusCode).toBe(400);
    expect(blockedTerms.body.message).toContain("terms");

    const incompatibleSetup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "BMW",
        model: "M340i",
        year: 2021,
        engine: "B58",
        ecuId: "MEVD172G",
        transmission: "AT",
        fuelType: "95 RON",
        installedMods: []
      });

    const blockedPreview = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/checkout-preview`)
      .set("Cookie", buyer.cookie)
      .send({ setupId: incompatibleSetup.body.setup.id });

    expect(blockedPreview.statusCode).toBe(200);
    expect(blockedPreview.body.purchaseButtonDisabled).toBe(true);
    expect(blockedPreview.body.compatibility.status).toBe("Not Compatible");

    const blockedCheckout = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/checkout`)
      .set("Cookie", buyer.cookie)
      .send({ setupId: incompatibleSetup.body.setup.id, acceptedLicense: true, acceptedVinPolicy: true });

    expect(blockedCheckout.statusCode).toBe(403);
    expect(blockedCheckout.body.message).toContain("compatibility");
  });
});
