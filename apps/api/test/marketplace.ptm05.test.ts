import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-05 Marketplace search and filters", () => {
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

  it("supports make/model/engine/fuel/stage filters and includes compatibility badges", async () => {
    const tuner = await signupAndLogin("search-tuner@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "BMW Stage 2",
        stage: "Stage 2",
        priceAmount: 299,
        priceCurrency: "EUR",
        requirements: {
          make: "BMW",
          model: "340i",
          engine: "B58",
          ecuId: "MEVD172G",
          fuelType: "98 RON",
          requiredMods: ["Downpipe"]
        }
      });

    await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Audi Stage 1",
        stage: "Stage 1",
        priceAmount: 199,
        priceCurrency: "EUR",
        requirements: {
          make: "Audi",
          model: "S3",
          engine: "EA888",
          ecuId: "SIMOS18",
          fuelType: "98 RON",
          requiredMods: []
        }
      });

    const buyer = await signupAndLogin("search-buyer@example.com");

    const setup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "BMW",
        model: "340i",
        year: 2018,
        engine: "B58",
        ecuId: "MEVD172G",
        transmission: "AT",
        fuelType: "98 RON",
        installedMods: ["Downpipe"]
      });

    const response = await request(app.getHttpServer())
      .get(
        `/v1/marketplace/search?setupId=${setup.body.setup.id}&make=BMW&model=340i&engine=B58&fuelType=98%20RON&stage=Stage%202&sort=relevance`
      )
      .set("Cookie", buyer.cookie);

    expect(response.statusCode).toBe(200);
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0].compatibility.status).toBe("Compatible");
  });

  it("supports relevance and newest sorting and includes card fields", async () => {
    const tuner = await signupAndLogin("search-tuner2@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const oldListing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Old Compatible",
        stage: "Stage 1",
        priceAmount: 150,
        priceCurrency: "EUR",
        requirements: {
          make: "Volkswagen",
          model: "Golf R",
          engine: "EA888",
          ecuId: "SIMOS19",
          fuelType: "E30",
          requiredMods: []
        }
      });

    const newListing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "New Incompatible",
        stage: "Stage 3",
        priceAmount: 450,
        priceCurrency: "EUR",
        requirements: {
          make: "Volkswagen",
          model: "Golf R",
          engine: "EA888",
          ecuId: "DIFFERENT_ECU",
          fuelType: "E30",
          requiredMods: []
        }
      });

    const buyer = await signupAndLogin("search-buyer2@example.com");

    const setup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "Volkswagen",
        model: "Golf R",
        year: 2020,
        engine: "EA888",
        ecuId: "SIMOS19",
        transmission: "DCT",
        fuelType: "E30",
        installedMods: []
      });

    const relevance = await request(app.getHttpServer())
      .get(`/v1/marketplace/search?setupId=${setup.body.setup.id}&sort=relevance`)
      .set("Cookie", buyer.cookie);

    expect(relevance.statusCode).toBe(200);
    expect(relevance.body.results[0].title).toBe(oldListing.body.listing.title);
    expect(relevance.body.results[0].compatibility.status).toBe("Compatible");
    expect(relevance.body.results[0].tunerDisplayName).toBeTypeOf("string");
    expect(relevance.body.results[0].stage).toBeDefined();
    expect(relevance.body.results[0].priceAmount).toBeDefined();
    expect(relevance.body.results[0].priceCurrency).toBeDefined();
    expect(relevance.body.results[0].tunerVerificationStatus).toBeDefined();

    const newest = await request(app.getHttpServer())
      .get(`/v1/marketplace/search?setupId=${setup.body.setup.id}&sort=newest`)
      .set("Cookie", buyer.cookie);

    expect(newest.statusCode).toBe(200);
    expect(newest.body.results[0].id).toBe(newListing.body.listing.id);
  });

  it("returns marketplace search responses under 1.5 seconds at MVP load", async () => {
    const tuner = await signupAndLogin("search-tuner3@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    for (let i = 0; i < 30; i += 1) {
      await request(app.getHttpServer())
        .post("/v1/listings")
        .set("Cookie", tuner.cookie)
        .send({
          title: `Perf Listing ${i}`,
          stage: i % 2 === 0 ? "Stage 1" : "Stage 2",
          priceAmount: 100 + i,
          priceCurrency: "EUR",
          requirements: {
            make: "BMW",
            model: "340i",
            engine: "B58",
            ecuId: "MEVD172G",
            fuelType: "98 RON",
            requiredMods: []
          }
        });
    }

    const buyer = await signupAndLogin("search-buyer3@example.com");
    const setup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "BMW",
        model: "340i",
        year: 2018,
        engine: "B58",
        ecuId: "MEVD172G",
        transmission: "AT",
        fuelType: "98 RON",
        installedMods: []
      });

    const startedAt = Date.now();
    const response = await request(app.getHttpServer())
      .get(`/v1/marketplace/search?setupId=${setup.body.setup.id}&sort=relevance`)
      .set("Cookie", buyer.cookie);
    const elapsedMs = Date.now() - startedAt;

    expect(response.statusCode).toBe(200);
    expect(elapsedMs).toBeLessThan(1500);
  });
});
