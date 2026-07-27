import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { ListingsModule } from "./listings/listings.module";
import { TunerModule } from "./tuner/tuner.module";
import { VehicleSetupsModule } from "./vehicle-setups/vehicle-setups.module";

@Module({
  controllers: [AppController],
  imports: [AuthModule, TunerModule, ListingsModule, VehicleSetupsModule]
})
export class AppModule {}
