import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { ListingsModule } from "./listings/listings.module";
import { TunerModule } from "./tuner/tuner.module";

@Module({
  controllers: [AppController],
  imports: [AuthModule, TunerModule, ListingsModule]
})
export class AppModule {}
