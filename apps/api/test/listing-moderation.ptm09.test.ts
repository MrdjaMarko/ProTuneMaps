import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-09 Listing moderation controls for admins", () => {
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

  it("unpublishes a listing with a reason, logs the action, and notifies the tuner", async () => {
    const tuner = await signupAndLogin("ptm09-tuner1@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Moderated Listing",
        stage: "Stage 2",
        priceAmount: 299,
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

    expect(listing.statusCode).toBe(201);
    expect(listing.body.listing.publishStatus).toBe("published");

    const admin = await signupAndLogin("ptm09-admin1@example.com");
    authService.updateUserRole(admin.userId, "admin");

    const unpublish = await request(app.getHttpServer())
      .post(`/v1/admin/listings/${listing.body.listing.id}/unpublish`)
      .set("Cookie", admin.cookie)
      .send({ reason: "Policy violation" });

    expect(unpublish.statusCode).toBe(200);
    expect(unpublish.body.moderation.action).toBe("unpublish");
    expect(unpublish.body.moderation.reason).toBe("Policy violation");
    expect(unpublish.body.moderation.actorUserId).toBe(admin.userId);
    expect(unpublish.body.moderation.createdAt).toBeTypeOf("number");

    const buyer = await signupAndLogin("ptm09-buyer1@example.com");
    const setup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "BMW",
        model: "M340i",
        year: 2020,
        engine: "B58",
        ecuId: "MEVD172G",
        transmission: "AT",
        fuelType: "98 RON",
        installedMods: []
      });

    const search = await request(app.getHttpServer())
      .get(`/v1/marketplace/search?setupId=${setup.body.setup.id}&sort=relevance`)
      .set("Cookie", buyer.cookie);

    expect(search.statusCode).toBe(200);
    expect(search.body.results.some((entry: { id: string }) => entry.id === listing.body.listing.id)).toBe(false);

    const moderationLog = await request(app.getHttpServer())
      .get(`/v1/admin/listings/${listing.body.listing.id}/moderation-log`)
      .set("Cookie", admin.cookie);

    expect(moderationLog.statusCode).toBe(200);
    expect(moderationLog.body.events).toHaveLength(1);
    expect(moderationLog.body.events[0].action).toBe("unpublish");
    expect(moderationLog.body.events[0].actorUserId).toBe(admin.userId);
    expect(moderationLog.body.events[0].reason).toBe("Policy violation");

    const notifications = await request(app.getHttpServer())
      .get("/v1/notifications")
      .set("Cookie", tuner.cookie);

    expect(notifications.statusCode).toBe(200);
    expect(notifications.body.notifications).toHaveLength(1);
    expect(notifications.body.notifications[0].listingId).toBe(listing.body.listing.id);
    expect(notifications.body.notifications[0].message).toContain("unpublished");
  });

  it("republishes a moderated listing after remediation and restores marketplace visibility", async () => {
    const tuner = await signupAndLogin("ptm09-tuner2@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Remediation Listing",
        stage: "Stage 2",
        priceAmount: 320,
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

    const admin = await signupAndLogin("ptm09-admin2@example.com");
    authService.updateUserRole(admin.userId, "admin");

    await request(app.getHttpServer())
      .post(`/v1/admin/listings/${listing.body.listing.id}/unpublish`)
      .set("Cookie", admin.cookie)
      .send({ reason: "Missing support evidence" })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/v1/listings/${listing.body.listing.id}`)
      .set("Cookie", tuner.cookie)
      .send({
        evidenceNotes: "Added dyno proof and support evidence.",
        knownLimitations: "Only for 98 RON fuel"
      })
      .expect(200);

    const republish = await request(app.getHttpServer())
      .post(`/v1/admin/listings/${listing.body.listing.id}/republish`)
      .set("Cookie", admin.cookie)
      .send({ reason: "Remediated" });

    expect(republish.statusCode).toBe(200);
    expect(republish.body.moderation.action).toBe("republish");
    expect(republish.body.moderation.reason).toBe("Remediated");

    const buyer = await signupAndLogin("ptm09-buyer2@example.com");
    const setup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "Volkswagen",
        model: "Golf R",
        year: 2021,
        engine: "EA888",
        ecuId: "SIMOS19",
        transmission: "DCT",
        fuelType: "98 RON",
        installedMods: ["Downpipe"]
      });

    const search = await request(app.getHttpServer())
      .get(`/v1/marketplace/search?setupId=${setup.body.setup.id}&sort=relevance`)
      .set("Cookie", buyer.cookie);

    expect(search.statusCode).toBe(200);
    expect(search.body.results.some((entry: { id: string }) => entry.id === listing.body.listing.id)).toBe(true);

    const moderationLog = await request(app.getHttpServer())
      .get(`/v1/admin/listings/${listing.body.listing.id}/moderation-log`)
      .set("Cookie", admin.cookie);

    expect(moderationLog.statusCode).toBe(200);
    expect(moderationLog.body.events).toHaveLength(2);
    expect(moderationLog.body.events[1].action).toBe("republish");
    expect(moderationLog.body.events[1].actorUserId).toBe(admin.userId);
  });
});
