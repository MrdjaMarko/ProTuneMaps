import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CompatibilityModule } from "../compatibility/compatibility.module";
import { VehicleSetupsModule } from "../vehicle-setups/vehicle-setups.module";
import { ListingsController } from "./listings.controller";
import { ListingsService } from "./listings.service";

@Module({
  imports: [AuthModule, VehicleSetupsModule, CompatibilityModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService]
})
export class ListingsModule {}
