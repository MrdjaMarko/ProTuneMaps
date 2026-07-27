import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-02 Tuner role request and verification", () => {
  let app: NestFastifyApplication;
  let authService: AuthService;

  beforeAll(async () => {
    app = await createApp();
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires display name, location, and contact email for tuner request", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "tuner1@example.com", password: "Passw0rd!" });

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "tuner1@example.com", password: "Passw0rd!" });

    const cookieHeader = login.headers["set-cookie"]?.[0];

    const missingFields = await request(app.getHttpServer())
      .post("/v1/tuner/request-verification")
      .set("Cookie", cookieHeader)
      .send({ displayName: "", businessLocation: "", contactEmail: "" });

    expect(missingFields.statusCode).toBe(400);

    const valid = await request(app.getHttpServer())
      .post("/v1/tuner/request-verification")
      .set("Cookie", cookieHeader)
      .send({
        displayName: "Boost Labs",
        businessLocation: "Belgrade",
        contactEmail: "ops@boostlabs.com"
      });

    expect(valid.statusCode).toBe(201);
    expect(valid.body.profile.displayName).toBe("Boost Labs");
    expect(valid.body.profile.businessLocation).toBe("Belgrade");
    expect(valid.body.profile.contactEmail).toBe("ops@boostlabs.com");
    expect(valid.body.profile.verificationStatus).toBe("pending");
    expect(valid.body.profile.verified).toBe(false);
  });

  it("allows only tuner role users to create listings", async () => {
    const signup = await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "tuner2@example.com", password: "Passw0rd!" });

    const buyerId = signup.body.user.id as string;

    const buyerLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "tuner2@example.com", password: "Passw0rd!" });

    const buyerCookie = buyerLogin.headers["set-cookie"]?.[0];

    const blocked = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", buyerCookie)
      .send({ title: "Stage 1" });

    expect(blocked.statusCode).toBe(403);

    await authService.updateUserRole(buyerId, "tuner");

    const allowed = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", buyerCookie)
      .send({ title: "Stage 1" });

    expect(allowed.statusCode).toBe(201);
    expect(allowed.body.created).toBe(true);
  });

  it("lets admin approve a tuner verification request", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "tuner3@example.com", password: "Passw0rd!" });

    const tunerLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "tuner3@example.com", password: "Passw0rd!" });

    const tunerCookie = tunerLogin.headers["set-cookie"]?.[0];

    const requestResult = await request(app.getHttpServer())
      .post("/v1/tuner/request-verification")
      .set("Cookie", tunerCookie)
      .send({
        displayName: "Turbo Works",
        businessLocation: "Novi Sad",
        contactEmail: "team@turbo.works"
      });

    const profileId = requestResult.body.profile.id as string;

    const adminSignup = await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "admin1@example.com", password: "Passw0rd!" });

    await authService.updateUserRole(adminSignup.body.user.id as string, "admin");

    const adminLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "admin1@example.com", password: "Passw0rd!" });

    const adminCookie = adminLogin.headers["set-cookie"]?.[0];

    const approval = await request(app.getHttpServer())
      .post(`/v1/admin/tuner-requests/${profileId}/approve`)
      .set("Cookie", adminCookie);

    expect(approval.statusCode).toBe(200);
    expect(approval.body.profile.verificationStatus).toBe("approved");
    expect(approval.body.profile.verified).toBe(true);

    const createListing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tunerCookie)
      .send({ title: "Stage 2" });

    expect(createListing.statusCode).toBe(201);
  });

  it("lets admin reject a tuner verification request", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "tuner4@example.com", password: "Passw0rd!" });

    const tunerLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "tuner4@example.com", password: "Passw0rd!" });

    const tunerCookie = tunerLogin.headers["set-cookie"]?.[0];

    const requestResult = await request(app.getHttpServer())
      .post("/v1/tuner/request-verification")
      .set("Cookie", tunerCookie)
      .send({
        displayName: "Map Squad",
        businessLocation: "Kragujevac",
        contactEmail: "hello@mapsquad.com"
      });

    const profileId = requestResult.body.profile.id as string;

    const adminSignup = await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "admin2@example.com", password: "Passw0rd!" });

    await authService.updateUserRole(adminSignup.body.user.id as string, "admin");

    const adminLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "admin2@example.com", password: "Passw0rd!" });

    const adminCookie = adminLogin.headers["set-cookie"]?.[0];

    const rejection = await request(app.getHttpServer())
      .post(`/v1/admin/tuner-requests/${profileId}/reject`)
      .set("Cookie", adminCookie);

    expect(rejection.statusCode).toBe(200);
    expect(rejection.body.profile.verificationStatus).toBe("rejected");
    expect(rejection.body.profile.verified).toBe(false);

    const createListing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tunerCookie)
      .send({ title: "Stage 3" });

    expect(createListing.statusCode).toBe(403);
  });
});
