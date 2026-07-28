import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-07 Map listing create/edit/publish with validation", () => {
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

  it("supports draft, edit, and publish flow with required and optional fields", async () => {
    const tuner = await signupAndLogin("ptm07-tuner1@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const created = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "GTI Stage 2",
        saveAsDraft: true
      });

    expect(created.statusCode).toBe(201);
    expect(created.body.listing.publishStatus).toBe("draft");

    const edited = await request(app.getHttpServer())
      .patch(`/v1/listings/${created.body.listing.id}`)
      .set("Cookie", tuner.cookie)
      .send({
        stage: "Stage 2",
        priceAmount: 249,
        priceCurrency: "EUR",
        requirements: {
          make: "Volkswagen",
          model: "GTI",
          engine: "EA888",
          ecuId: "SIMOS18",
          transmission: "DCT",
          fuelType: "98 RON",
          requiredMods: ["Downpipe"]
        },
        dynoImages: ["https://example.com/dyno1.jpg"],
        evidenceNotes: "Validated on 3 pulls, intake air temps stabilized.",
        knownLimitations: "Requires colder spark plugs for high ambient temperatures."
      });

    expect(edited.statusCode).toBe(200);

    const published = await request(app.getHttpServer())
      .post(`/v1/listings/${created.body.listing.id}/publish`)
      .set("Cookie", tuner.cookie)
      .send();

    expect(published.statusCode).toBe(200);
    expect(published.body.listing.publishStatus).toBe("published");
    expect(published.body.listing.dynoImages).toEqual(["https://example.com/dyno1.jpg"]);
    expect(published.body.listing.evidenceNotes).toBeDefined();
    expect(published.body.listing.knownLimitations).toBeDefined();
  });

  it("blocks publish when compatibility metadata is invalid", async () => {
    const tuner = await signupAndLogin("ptm07-tuner2@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const created = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Incomplete Listing",
        saveAsDraft: true,
        stage: "Stage 1",
        priceAmount: 100,
        priceCurrency: "EUR",
        requirements: {
          make: "BMW",
          model: "340i",
          requiredMods: []
        }
      });

    expect(created.statusCode).toBe(201);
    expect(created.body.listing.publishStatus).toBe("draft");

    const publish = await request(app.getHttpServer())
      .post(`/v1/listings/${created.body.listing.id}/publish`)
      .set("Cookie", tuner.cookie)
      .send();

    expect(publish.statusCode).toBe(400);
    expect(publish.body.message).toContain("required fields");
  });

  it("shows only published listings in marketplace search within one minute", async () => {
    const tuner = await signupAndLogin("ptm07-tuner3@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const draftListing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Draft Listing",
        saveAsDraft: true,
        stage: "Stage 1",
        priceAmount: 150,
        priceCurrency: "EUR",
        requirements: {
          make: "BMW",
          model: "340i",
          engine: "B58",
          ecuId: "MEVD172G",
          transmission: "AT",
          fuelType: "98 RON",
          requiredMods: []
        }
      });

    const publishedListing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Published Listing",
        stage: "Stage 1",
        priceAmount: 180,
        priceCurrency: "EUR",
        requirements: {
          make: "BMW",
          model: "340i",
          engine: "B58",
          ecuId: "MEVD172G",
          transmission: "AT",
          fuelType: "98 RON",
          requiredMods: []
        }
      });

    expect(draftListing.statusCode).toBe(201);
    expect(draftListing.body.listing.publishStatus).toBe("draft");
    expect(publishedListing.statusCode).toBe(201);
    expect(publishedListing.body.listing.publishStatus).toBe("published");

    const buyer = await signupAndLogin("ptm07-buyer@example.com");
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
    const search = await request(app.getHttpServer())
      .get(`/v1/marketplace/search?setupId=${setup.body.setup.id}&make=BMW&model=340i&sort=relevance`)
      .set("Cookie", buyer.cookie);

    const elapsedMs = Date.now() - startedAt;

    expect(search.statusCode).toBe(200);
    expect(search.body.results.some((x: { id: string }) => x.id === draftListing.body.listing.id)).toBe(false);
    expect(search.body.results.some((x: { id: string }) => x.id === publishedListing.body.listing.id)).toBe(true);
    expect(elapsedMs).toBeLessThan(60000);
  });

  it("moves a published listing back to draft when edits make publish metadata invalid", async () => {
    const tuner = await signupAndLogin("ptm07-tuner4@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const created = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tuner.cookie)
      .send({
        title: "Published Then Invalid",
        stage: "Stage 2",
        priceAmount: 220,
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

    expect(created.statusCode).toBe(201);
    expect(created.body.listing.publishStatus).toBe("published");

    const edited = await request(app.getHttpServer())
      .patch(`/v1/listings/${created.body.listing.id}`)
      .set("Cookie", tuner.cookie)
      .send({
        priceAmount: 0
      });

    expect(edited.statusCode).toBe(200);
    expect(edited.body.listing.publishStatus).toBe("draft");

    const buyer = await signupAndLogin("ptm07-buyer2@example.com");
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

    const search = await request(app.getHttpServer())
      .get(`/v1/marketplace/search?setupId=${setup.body.setup.id}&make=BMW&model=340i&sort=relevance`)
      .set("Cookie", buyer.cookie);

    expect(search.statusCode).toBe(200);
    expect(search.body.results.some((x: { id: string }) => x.id === created.body.listing.id)).toBe(false);
  });
});
