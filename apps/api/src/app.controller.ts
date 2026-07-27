import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      name: "ProTuneMaps API",
      status: "ok",
      message: "API is running"
    };
  }

  @Get("health")
  health() {
    return {
      status: "ok"
    };
  }
}
