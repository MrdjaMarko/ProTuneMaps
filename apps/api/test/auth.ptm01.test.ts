import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";

describe("PTM-01 Auth", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows user signup with email and password", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "buyer1@example.com", password: "Passw0rd!" });

    expect(response.statusCode).toBe(201);
    expect(response.body.user.email).toBe("buyer1@example.com");
    expect(response.body.user.emailVerified).toBe(false);
    expect(response.body.verificationToken).toBeTypeOf("string");
  });

  it("denies purchase readiness before email verification", async () => {
    const signup = await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "buyer2@example.com", password: "Passw0rd!" });

    const token = signup.body.verificationToken as string;

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "buyer2@example.com", password: "Passw0rd!" });

    const cookieHeader = login.headers["set-cookie"]?.[0];

    const blocked = await request(app.getHttpServer())
      .get("/v1/auth/purchase-ready")
      .set("Cookie", cookieHeader);

    expect(blocked.statusCode).toBe(403);
    expect(blocked.body.message).toContain("Email verification required");

    await request(app.getHttpServer()).post("/v1/auth/verify-email").send({ token });

    const allowed = await request(app.getHttpServer())
      .get("/v1/auth/purchase-ready")
      .set("Cookie", cookieHeader);

    expect(allowed.statusCode).toBe(200);
    expect(allowed.body.ready).toBe(true);
  });

  it("supports login and logout", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "buyer3@example.com", password: "Passw0rd!" });

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "buyer3@example.com", password: "Passw0rd!" });

    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toBeDefined();

    const logout = await request(app.getHttpServer())
      .post("/v1/auth/logout")
      .set("Cookie", login.headers["set-cookie"]?.[0]);

    expect(logout.statusCode).toBe(200);
  });

  it("keeps session active across multiple requests", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "buyer4@example.com", password: "Passw0rd!" });

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "buyer4@example.com", password: "Passw0rd!" });

    const cookieHeader = login.headers["set-cookie"]?.[0];

    const me1 = await request(app.getHttpServer()).get("/v1/auth/me").set("Cookie", cookieHeader);
    const me2 = await request(app.getHttpServer()).get("/v1/auth/me").set("Cookie", cookieHeader);

    expect(me1.statusCode).toBe(200);
    expect(me2.statusCode).toBe(200);
    expect(me1.body.email).toBe("buyer4@example.com");
    expect(me2.body.email).toBe("buyer4@example.com");
  });

  it("returns same generic message for missing user and wrong password", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "buyer5@example.com", password: "Passw0rd!" });

    const wrongPassword = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "buyer5@example.com", password: "WrongPass1!" });

    const missingUser = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "nobody@example.com", password: "Passw0rd!" });

    expect(wrongPassword.statusCode).toBe(401);
    expect(missingUser.statusCode).toBe(401);
    expect(wrongPassword.body.message).toBe("Invalid credentials");
    expect(missingUser.body.message).toBe("Invalid credentials");
  });

  it("allows password reset with token flow", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email: "buyer6@example.com", password: "Passw0rd!" });

    const resetRequest = await request(app.getHttpServer())
      .post("/v1/auth/password/reset-request")
      .send({ email: "buyer6@example.com" });

    expect(resetRequest.statusCode).toBe(200);
    expect(resetRequest.body.message).toBe("If the account exists, a reset link has been sent.");

    const resetToken = resetRequest.body.resetToken as string;

    const resetConfirm = await request(app.getHttpServer())
      .post("/v1/auth/password/reset-confirm")
      .send({ token: resetToken, newPassword: "N3wPassw0rd!" });

    expect(resetConfirm.statusCode).toBe(200);

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "buyer6@example.com", password: "N3wPassw0rd!" });

    expect(login.statusCode).toBe(200);
  });
});
