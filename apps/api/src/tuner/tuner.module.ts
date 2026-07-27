import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TunerController } from "./tuner.controller";
import { TunerService } from "./tuner.service";

@Module({
  imports: [AuthModule],
  controllers: [TunerController],
  providers: [TunerService],
  exports: [TunerService]
})
export class TunerModule {}
