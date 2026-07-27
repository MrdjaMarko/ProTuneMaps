import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { VehicleSetupsService } from "./vehicle-setups.service";

@Controller("v1/vehicle-setups")
@UseGuards(AuthGuard)
export class VehicleSetupsController {
  constructor(@Inject(VehicleSetupsService) private readonly vehicleSetupsService: VehicleSetupsService) {}

  @Post()
  create(
    @Req() request: { currentUserId: string },
    @Body()
    body: {
      make: string;
      model: string;
      year: number;
      engine: string;
      ecuId: string;
      transmission: string;
      fuelType: string;
      installedMods: string[];
    }
  ) {
    return {
      setup: this.vehicleSetupsService.create(request.currentUserId, body)
    };
  }

  @Get()
  list(@Req() request: { currentUserId: string }) {
    return {
      setups: this.vehicleSetupsService.listByUser(request.currentUserId)
    };
  }

  @Patch(":setupId")
  update(
    @Req() request: { currentUserId: string },
    @Param("setupId") setupId: string,
    @Body()
    body: {
      make?: string;
      model?: string;
      year?: number;
      engine?: string;
      ecuId?: string;
      transmission?: string;
      fuelType?: string;
      installedMods?: string[];
    }
  ) {
    return {
      setup: this.vehicleSetupsService.update(request.currentUserId, setupId, body)
    };
  }

  @Delete(":setupId")
  remove(@Req() request: { currentUserId: string }, @Param("setupId") setupId: string) {
    this.vehicleSetupsService.delete(request.currentUserId, setupId);
    return { deleted: true };
  }
}
