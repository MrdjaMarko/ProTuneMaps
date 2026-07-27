import { Module } from "@nestjs/common";
import { CompatibilityService } from "./compatibility.service";

@Module({
  providers: [CompatibilityService],
  exports: [CompatibilityService]
})
export class CompatibilityModule {}
