import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { AuthService } from "../src/auth/auth.service";

describe("PTM-15 Ticket thread, status lifecycle, and notifications", () => {
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

  async function createSupportTicket(tunerCookie: string, buyerEmail: string, idempotencyKey: string) {
    const listing = await request(app.getHttpServer())
      .post("/v1/listings")
      .set("Cookie", tunerCookie)
      .send({
        title: "BMW M340i Threaded Support v1.0.0",
        stage: "Stage 2",
        priceAmount: 325,
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
      .set("Cookie", tunerCookie)
      .send({
        semanticLabel: "v1.0.0",
        changelogNotes: "Initial release for PTM-15."
      });

    const buyer = await signupAndLogin(buyerEmail);
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
        idempotencyKey
      });

    expect(payment.statusCode).toBe(201);

    const ticket = await request(app.getHttpServer())
      .post(`/v1/orders/${payment.body.order.id}/support-tickets`)
      .set("Cookie", buyer.cookie)
      .send({
        issueType: "drivability",
        message: "The car stumbles on tip-in."
      });

    expect(ticket.statusCode).toBe(201);

    return {
      buyer,
      tunerCookie,
      listingId: listing.body.listing.id as string,
      orderId: payment.body.order.id as string,
      ticketId: ticket.body.ticket.id as string
    };
  }

  it("allows threaded replies, records timeline events, and emails participants on messages and status changes", async () => {
    const tuner = await signupAndLogin("ptm15-tuner@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const context = await createSupportTicket(tuner.cookie, "ptm15-buyer@example.com", "ptm15-payment-001");

    const buyerReply = await request(app.getHttpServer())
      .post(`/v1/support-tickets/${context.ticketId}/messages`)
      .set("Cookie", context.buyer.cookie)
      .send({ message: "I also noticed hesitation during cold starts." });

    expect(buyerReply.statusCode).toBe(201);
    expect(buyerReply.body.message.authorUserId).toBe(context.buyer.userId);

    const tunerReply = await request(app.getHttpServer())
      .post(`/v1/support-tickets/${context.ticketId}/messages`)
      .set("Cookie", tuner.cookie)
      .send({ message: "Please send a short log and I will review the map." });

    expect(tunerReply.statusCode).toBe(201);
    expect(tunerReply.body.message.authorUserId).toBe(tuner.userId);

    const buyerStatus = await request(app.getHttpServer())
      .patch(`/v1/support-tickets/${context.ticketId}`)
      .set("Cookie", context.buyer.cookie)
      .send({ status: "Waiting on Buyer" });

    expect(buyerStatus.statusCode).toBe(200);
    expect(buyerStatus.body.ticket.status).toBe("Waiting on Buyer");

    const detail = await request(app.getHttpServer())
      .get(`/v1/support-tickets/${context.ticketId}`)
      .set("Cookie", context.buyer.cookie);

    expect(detail.statusCode).toBe(200);
    expect(detail.body.ticket.messages).toHaveLength(3);
    expect(detail.body.ticket.timeline.some((entry: { action: string }) => entry.action === "message_sent")).toBe(true);
    expect(detail.body.ticket.timeline.some((entry: { action: string }) => entry.action === "status_changed")).toBe(true);
    expect(detail.body.ticket.timeline[0].who).toBe(context.buyer.userId);

    const notifications = await request(app.getHttpServer())
      .get("/v1/notifications")
      .set("Cookie", tuner.cookie);

    expect(notifications.statusCode).toBe(200);
    expect(notifications.body.notifications.some((entry: { message: string }) => entry.message.includes("ticket") && entry.message.includes("message"))).toBe(true);
  });

  it("blocks closed tickets from new messages until reopened by an authorized role", async () => {
    const tuner = await signupAndLogin("ptm15-tuner-2@example.com");
    authService.updateUserRole(tuner.userId, "tuner");

    const context = await createSupportTicket(tuner.cookie, "ptm15-buyer-2@example.com", "ptm15-payment-002");

    const close = await request(app.getHttpServer())
      .patch(`/v1/support-tickets/${context.ticketId}`)
      .set("Cookie", tuner.cookie)
      .send({ status: "Closed" });

    expect(close.statusCode).toBe(200);
    expect(close.body.ticket.status).toBe("Closed");

    const blockedMessage = await request(app.getHttpServer())
      .post(`/v1/support-tickets/${context.ticketId}/messages`)
      .set("Cookie", context.buyer.cookie)
      .send({ message: "Can I still add one more log?" });

    expect(blockedMessage.statusCode).toBe(403);

    const reopened = await request(app.getHttpServer())
      .patch(`/v1/support-tickets/${context.ticketId}`)
      .set("Cookie", context.buyer.cookie)
      .send({ status: "Open" });

    expect(reopened.statusCode).toBe(200);
    expect(reopened.body.ticket.status).toBe("Open");

    const newMessage = await request(app.getHttpServer())
      .post(`/v1/support-tickets/${context.ticketId}/messages`)
      .set("Cookie", context.buyer.cookie)
      .send({ message: "Reopened with a fresh log attached." });

    expect(newMessage.statusCode).toBe(201);
  });
});
