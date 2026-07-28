import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CompatibilityModule } from "../compatibility/compatibility.module";
import { TunerModule } from "../tuner/tuner.module";
import { VehicleSetupsModule } from "../vehicle-setups/vehicle-setups.module";
import { ListingsController } from "./listings.controller";
import { DeliveryController } from "./delivery.controller";
import { MarketplaceController } from "./marketplace.controller";
import { PublicTunerProfileController } from "./public-tuner-profile.controller";
import { ListingsService } from "./listings.service";

@Module({
  imports: [AuthModule, VehicleSetupsModule, CompatibilityModule, TunerModule],
  controllers: [ListingsController, DeliveryController, MarketplaceController, PublicTunerProfileController],
  providers: [ListingsService],
  exports: [ListingsService]
})
export class ListingsModule {}
