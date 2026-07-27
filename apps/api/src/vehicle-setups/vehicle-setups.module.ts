import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { VehicleSetupsController } from "./vehicle-setups.controller";
import { VehicleSetupsService } from "./vehicle-setups.service";

@Module({
  imports: [AuthModule],
  controllers: [VehicleSetupsController],
  providers: [VehicleSetupsService],
  exports: [VehicleSetupsService]
})
export class VehicleSetupsModule {}
