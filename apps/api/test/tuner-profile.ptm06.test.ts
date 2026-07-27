import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-06 Public tuner profile and trust metrics shell", () => {
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

  it("returns public profile shell with stable URL, verification status, supported platforms, and trust placeholders", async () => {
    const tuner = await signupAndLogin("public-profile-1@example.com");

    const verification = await request(app.getHttpServer())
      .post("/v1/tuner/request-verification")
      .set("Cookie", tuner.cookie)
      .send({
        displayName: "Torque Forge",
        businessLocation: "Belgrade",
        contactEmail: "ops@torqueforge.com",
        bio: "BMW and VAG calibration specialist",
        supportedPlatforms: ["BMW", "VAG"]
      });

    const profileId = verification.body.profile.id as string;

    const profile = await request(app.getHttpServer()).get(`/v1/tuners/${profileId}`);

    expect(profile.statusCode).toBe(200);
    expect(profile.body.profile.id).toBe(profileId);
    expect(profile.body.profile.displayName).toBe("Torque Forge");
    expect(profile.body.profile.bio).toBe("BMW and VAG calibration specialist");
    expect(profile.body.profile.supportedPlatforms).toEqual(["BMW", "VAG"]);
    expect(profile.body.profile.verificationStatus).toBe("pending");
    expect(profile.body.profile.verificationLabel).toBe("Unverified");
    expect(profile.body.profile.trustMetrics).toEqual({
      installs: 0,
      averageRating: null,
      supportResponseMedianHours: null
    });
    expect(profile.body.profileUrl).toBe(`/v1/tuners/${profileId}`);

    const profileAgain = await request(app.getHttpServer()).get(`/v1/tuners/${profileId}`);
    expect(profileAgain.statusCode).toBe(200);
    expect(profileAgain.body.profile.id).toBe(profileId);
  });

  it("lists published maps on public tuner profile", async () => {
    const tuner = await signupAndLogin("public-profile-2@example.com");

    const verification = await request(app.getHttpServer())
      .post("/v1/tuner/request-verification")
      .set("Cookie", tuner.cookie)
      .send({
        displayName: "Pulse Mapping",
        businessLocation: "Novi Sad",
        contactEmail: "hello@pulsemapping.com",
        bio: "Track focused calibrations",
        supportedPlatforms: ["Volkswagen"]
      });

    const profileId = verification.body.profile.id as string;

    const admin = await signupAndLogin("public-profile-admin@example.com");
    authService.updateUserRole(admin.userId, "admin");

    await request(app.getHttpServer())
      .post(`/v1/admin/tuner-requests/${profileId}/approve`)
      .set("Cookie", admin.cookie)
      .expect(200);

    await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Golf R Stage 1",
        stage: "Stage 1",
        priceAmount: 180,
        priceCurrency: "EUR",
        requirements: {
          make: "Volkswagen",
          model: "Golf R",
          engine: "EA888",
          ecuId: "SIMOS19",
          fuelType: "98 RON",
          requiredMods: []
        }
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Golf R Stage 2",
        stage: "Stage 2",
        priceAmount: 290,
        priceCurrency: "EUR",
        requirements: {
          make: "Volkswagen",
          model: "Golf R",
          engine: "EA888",
          ecuId: "SIMOS19",
          fuelType: "98 RON",
          requiredMods: ["Downpipe"]
        }
      })
      .expect(201);

    const profile = await request(app.getHttpServer()).get(`/v1/tuners/${profileId}`);

    expect(profile.statusCode).toBe(200);
    expect(profile.body.publishedMaps).toHaveLength(2);
    expect(profile.body.publishedMaps[0].title).toBeDefined();
    expect(profile.body.publishedMaps[0].stage).toBeDefined();
    expect(profile.body.publishedMaps[0].priceAmount).toBeDefined();
    expect(profile.body.publishedMaps[0].priceCurrency).toBeDefined();
  });
});
