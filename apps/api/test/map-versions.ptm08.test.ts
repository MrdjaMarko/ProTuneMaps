import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-08 Map version upload and changelog history", () => {
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

  it("uploads a new semantic version with changelog notes and shows history on the listing page", async () => {
    const tuner = await signupAndLogin("ptm08-tuner1@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "BMW M340i Stage 2",
        stage: "Stage 2",
        priceAmount: 299,
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

    expect(listing.statusCode).toBe(201);

    const version = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/versions`)
      .set("Cookie", tuner.cookie)
      .send({
        semanticLabel: "v1.1.0",
        changelogNotes: "Refined ignition timing and torque limiters for high-load pulls."
      });

    expect(version.statusCode).toBe(201);
    expect(version.body.version.semanticLabel).toBe("v1.1.0");
    expect(version.body.version.changelogNotes).toContain("Refined ignition timing");

    const detail = await request(app.getHttpServer())
      .get(`/v1/listings/${listing.body.listing.id}`)
      .set("Cookie", tuner.cookie);

    expect(detail.statusCode).toBe(200);
    expect(detail.body.versionHistory).toHaveLength(1);
    expect(detail.body.versionHistory[0].semanticLabel).toBe("v1.1.0");
    expect(detail.body.versionHistory[0].changelogNotes).toBeDefined();
  });

  it("requires changelog notes when uploading a version", async () => {
    const tuner = await signupAndLogin("ptm08-tuner2@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Audi RS3 Stage 1",
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
        semanticLabel: "v1.0.1",
        changelogNotes: ""
      });

    expect(version.statusCode).toBe(400);
  });

  it("binds entitlements to a purchased version until explicitly upgraded and shows exact download metadata", async () => {
    const tuner = await signupAndLogin("ptm08-tuner3@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Volkswagen Golf R Stage 2",
        stage: "Stage 2",
        priceAmount: 249,
        priceCurrency: "EUR",
        requirements: {
          make: "Volkswagen",
          model: "Golf R",
          engine: "EA888",
          ecuId: "SIMOS19",
          fuelType: "98 RON",
          requiredMods: ["Downpipe"]
        }
      });

    const versionOne = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/versions`)
      .set("Cookie", tuner.cookie)
      .send({
        semanticLabel: "v1.0.0",
        changelogNotes: "Initial release for stock turbo vehicles."
      });

    const versionTwo = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/versions`)
      .set("Cookie", tuner.cookie)
      .send({
        semanticLabel: "v1.1.0",
        changelogNotes: "Raised boost target and refreshed fueling tables."
      });

    const buyer = await signupAndLogin("ptm08-buyer@example.com");

    const entitlement = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/entitlements`)
      .set("Cookie", buyer.cookie)
      .send({ versionId: versionOne.body.version.id });

    expect(entitlement.statusCode).toBe(201);
    expect(entitlement.body.entitlement.versionId).toBe(versionOne.body.version.id);

    const upgraded = await request(app.getHttpServer())
      .patch(`/v1/entitlements/${entitlement.body.entitlement.id}`)
      .set("Cookie", buyer.cookie)
      .send({ versionId: versionTwo.body.version.id });

    expect(upgraded.statusCode).toBe(200);
    expect(upgraded.body.entitlement.versionId).toBe(versionTwo.body.version.id);

    const download = await request(app.getHttpServer())
      .get(`/v1/downloads/${entitlement.body.entitlement.id}`)
      .set("Cookie", buyer.cookie);

    expect(download.statusCode).toBe(200);
    expect(download.body.download.semanticLabel).toBe("v1.1.0");
    expect(download.body.download.versionTimestamp).toBeTypeOf("number");
    expect(download.body.download.versionTimestamp).toBeGreaterThan(0);
  });
});
