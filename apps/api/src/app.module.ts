import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { ListingsModule } from "./listings/listings.module";
import { TunerModule } from "./tuner/tuner.module";

@Module({
  imports: [AuthModule, TunerModule, ListingsModule]
})
export class AppModule {}
