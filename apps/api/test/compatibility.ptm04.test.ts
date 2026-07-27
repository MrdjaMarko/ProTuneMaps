import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-04 Compatibility evaluator and badges", () => {
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

  it("shows Compatible, Partially Compatible, and Not Compatible results", async () => {
    const tuner = await signupAndLogin("compat-tuner@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const createdListing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "B58 Stage 1",
        requirements: {
          make: "BMW",
          model: "340i",
          engine: "B58",
          ecuId: "MEVD172G",
          transmission: "AT",
          fuelType: "98 RON",
          requiredMods: ["Downpipe", "Intercooler"]
        }
      });

    const listingId = createdListing.body.listing.id as string;

    const buyer = await signupAndLogin("compat-buyer@example.com");

    const compatibleSetup = await request(app.getHttpServer())
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
        installedMods: ["Downpipe", "Intercooler"]
      });

    const partialSetup = await request(app.getHttpServer())
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

    const incompatibleSetup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "BMW",
        model: "340i",
        year: 2018,
        engine: "B58",
        ecuId: "WRONG_ECU",
        transmission: "AT",
        fuelType: "98 RON",
        installedMods: ["Downpipe", "Intercooler"]
      });

    const compatible = await request(app.getHttpServer())
      .get(`/v1/listings/${listingId}/compatibility?setupId=${compatibleSetup.body.setup.id}`)
      .set("Cookie", buyer.cookie);

    const partial = await request(app.getHttpServer())
      .get(`/v1/listings/${listingId}/compatibility?setupId=${partialSetup.body.setup.id}`)
      .set("Cookie", buyer.cookie);

    const incompatible = await request(app.getHttpServer())
      .get(`/v1/listings/${listingId}/compatibility?setupId=${incompatibleSetup.body.setup.id}`)
      .set("Cookie", buyer.cookie);

    expect(compatible.statusCode).toBe(200);
    expect(compatible.body.compatibility.status).toBe("Compatible");

    expect(partial.statusCode).toBe(200);
    expect(partial.body.compatibility.status).toBe("Partially Compatible");
    expect(partial.body.compatibility.missingRequirements).toContain("required mod missing: Intercooler");

    expect(incompatible.statusCode).toBe(200);
    expect(incompatible.body.compatibility.status).toBe("Not Compatible");
  });

  it("blocks purchase for incompatible listings", async () => {
    const tuner = await signupAndLogin("compat-tuner2@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "EA888 Stage 2",
        requirements: {
          make: "Volkswagen",
          model: "Golf R",
          engine: "EA888",
          ecuId: "SIMOS19",
          transmission: "DCT",
          fuelType: "E30",
          requiredMods: ["Downpipe"]
        }
      });

    const buyer = await signupAndLogin("compat-buyer2@example.com");

    const setup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "Volkswagen",
        model: "Golf R",
        year: 2020,
        engine: "EA888",
        ecuId: "WRONG",
        transmission: "DCT",
        fuelType: "E30",
        installedMods: ["Downpipe"]
      });

    const blocked = await request(app.getHttpServer())
      .post(`/v1/listings/${listing.body.listing.id}/purchase-check`)
      .set("Cookie", buyer.cookie)
      .send({ setupId: setup.body.setup.id });

    expect(blocked.statusCode).toBe(403);
    expect(blocked.body.message).toContain("not compatible");
  });

  it("uses deterministic compatibility decisions from saved rules", async () => {
    const tuner = await signupAndLogin("compat-tuner3@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "M133 Stage 1",
        requirements: {
          make: "Mercedes",
          model: "A45",
          engine: "M133",
          ecuId: "MED17",
          transmission: "DCT",
          fuelType: "98 RON",
          requiredMods: ["Intake"]
        }
      });

    const buyer = await signupAndLogin("compat-buyer3@example.com");

    const setup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "Mercedes",
        model: "A45",
        year: 2019,
        engine: "M133",
        ecuId: "MED17",
        transmission: "DCT",
        fuelType: "98 RON",
        installedMods: []
      });

    const first = await request(app.getHttpServer())
      .get(`/v1/listings/${listing.body.listing.id}/compatibility?setupId=${setup.body.setup.id}`)
      .set("Cookie", buyer.cookie);

    const second = await request(app.getHttpServer())
      .get(`/v1/listings/${listing.body.listing.id}/compatibility?setupId=${setup.body.setup.id}`)
      .set("Cookie", buyer.cookie);

    expect(first.body.compatibility).toEqual(second.body.compatibility);
    expect(first.body.compatibility.status).toBe("Partially Compatible");
  });

  it("exposes compatibility output in listing search page responses", async () => {
    const tuner = await signupAndLogin("compat-tuner4@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "B58 Stage 2",
        requirements: {
          make: "BMW",
          model: "340i",
          engine: "B58",
          ecuId: "MEVD172G",
          transmission: "AT",
          fuelType: "98 RON",
          requiredMods: ["Downpipe"]
        }
      });

    const buyer = await signupAndLogin("compat-buyer4@example.com");

    const setup = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", buyer.cookie)
      .send({
        make: "BMW",
        model: "340i",
        year: 2019,
        engine: "B58",
        ecuId: "MEVD172G",
        transmission: "AT",
        fuelType: "98 RON",
        installedMods: []
      });

    const list = await request(app.getHttpServer())
      .get(`/v1/listings?setupId=${setup.body.setup.id}`)
      .set("Cookie", buyer.cookie);

    expect(list.statusCode).toBe(200);
    expect(list.body.listings.length).toBeGreaterThan(0);
    expect(list.body.listings[0].compatibility).toBeDefined();
    expect(typeof list.body.listings[0].compatibility.status).toBe("string");
  });
});
