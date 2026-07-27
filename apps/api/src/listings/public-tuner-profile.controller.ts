import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ListingsService } from "./listings.service";
import { TunerService } from "../tuner/tuner.service";

@Controller("v1/tuners")
export class PublicTunerProfileController {
  constructor(
    @Inject(TunerService) private readonly tunerService: TunerService,
    @Inject(ListingsService) private readonly listingsService: ListingsService
  ) {}

  @Get(":profileId")
  getProfile(@Param("profileId") profileId: string) {
    const profile = this.tunerService.getPublicProfile(profileId);
    const publishedMaps = this.listingsService.getPublishedMapsByTunerUserId(profile.userId);

    return {
      profile,
      publishedMaps,
      profileUrl: `/v1/tuners/${profile.id}`
    };
  }
}
