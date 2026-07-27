import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { VehicleSetupsService } from "../src/vehicle-setups/vehicle-setups.service";

describe("PTM-03 Vehicle setup CRUD", () => {
  let app: NestFastifyApplication;
  let vehicleSetupsService: VehicleSetupsService;

  beforeAll(async () => {
    app = await createApp();
    vehicleSetupsService = app.get(VehicleSetupsService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function signupAndLogin(email: string) {
    await request(app.getHttpServer())
      .post("/v1/auth/signup")
      .send({ email, password: "Passw0rd!" });

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email, password: "Passw0rd!" });

    const me = await request(app.getHttpServer())
      .get("/v1/auth/me")
      .set("Cookie", login.headers["set-cookie"]?.[0]);

    return {
      userId: me.body.id as string,
      cookieHeader: login.headers["set-cookie"]?.[0] as string
    };
  }

  it("saves a setup with required fields and mods", async () => {
    const session = await signupAndLogin("buyer-setup1@example.com");

    const created = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", session.cookieHeader)
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

    expect(created.statusCode).toBe(201);
    expect(created.body.setup.make).toBe("BMW");
    expect(created.body.setup.model).toBe("340i");
    expect(created.body.setup.installedMods).toEqual(["Downpipe", "Intercooler"]);
  });

  it("validates required setup fields", async () => {
    const session = await signupAndLogin("buyer-setup2@example.com");

    const invalid = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", session.cookieHeader)
      .send({
        make: "",
        model: "",
        year: 0,
        engine: "",
        ecuId: "",
        transmission: "",
        fuelType: "",
        installedMods: []
      });

    expect(invalid.statusCode).toBe(400);
  });

  it("supports multiple saved setups for one buyer", async () => {
    const session = await signupAndLogin("buyer-setup3@example.com");

    await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", session.cookieHeader)
      .send({
        make: "Audi",
        model: "S3",
        year: 2019,
        engine: "EA888",
        ecuId: "SIMOS18",
        transmission: "DCT",
        fuelType: "98 RON",
        installedMods: ["Intake"]
      });

    await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", session.cookieHeader)
      .send({
        make: "Volkswagen",
        model: "Golf R",
        year: 2020,
        engine: "EA888",
        ecuId: "SIMOS19",
        transmission: "DCT",
        fuelType: "E30",
        installedMods: ["Downpipe"]
      });

    const list = await request(app.getHttpServer())
      .get("/v1/vehicle-setups")
      .set("Cookie", session.cookieHeader);

    expect(list.statusCode).toBe(200);
    expect(list.body.setups).toHaveLength(2);
  });

  it("supports edit and delete of a saved setup", async () => {
    const session = await signupAndLogin("buyer-setup4@example.com");

    const created = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", session.cookieHeader)
      .send({
        make: "Subaru",
        model: "WRX",
        year: 2017,
        engine: "FA20",
        ecuId: "Denso123",
        transmission: "MT",
        fuelType: "95 RON",
        installedMods: ["Catback"]
      });

    const setupId = created.body.setup.id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/v1/vehicle-setups/${setupId}`)
      .set("Cookie", session.cookieHeader)
      .send({
        transmission: "CVT",
        fuelType: "98 RON",
        installedMods: ["Catback", "Intake"]
      });

    expect(updated.statusCode).toBe(200);
    expect(updated.body.setup.transmission).toBe("CVT");
    expect(updated.body.setup.fuelType).toBe("98 RON");

    const deleted = await request(app.getHttpServer())
      .delete(`/v1/vehicle-setups/${setupId}`)
      .set("Cookie", session.cookieHeader);

    expect(deleted.statusCode).toBe(200);

    const listAfterDelete = await request(app.getHttpServer())
      .get("/v1/vehicle-setups")
      .set("Cookie", session.cookieHeader);

    expect(listAfterDelete.body.setups).toHaveLength(0);
  });

  it("exposes setup data for compatibility logic", async () => {
    const session = await signupAndLogin("buyer-setup5@example.com");

    const created = await request(app.getHttpServer())
      .post("/v1/vehicle-setups")
      .set("Cookie", session.cookieHeader)
      .send({
        make: "Mercedes",
        model: "A45",
        year: 2018,
        engine: "M133",
        ecuId: "BoschMED17",
        transmission: "DCT",
        fuelType: "98 RON",
        installedMods: ["Turbo Inlet"]
      });

    const setupId = created.body.setup.id as string;

    const compatibilityContext = vehicleSetupsService.getSetupForCompatibility(session.userId, setupId);

    expect(compatibilityContext.make).toBe("Mercedes");
    expect(compatibilityContext.ecuId).toBe("BoschMED17");
    expect(compatibilityContext.installedMods).toEqual(["Turbo Inlet"]);
  });
});
