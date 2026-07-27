import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuthService } from "../auth/auth.service";

type VerificationStatus = "pending" | "approved" | "rejected";

interface TunerProfile {
  id: string;
  userId: string;
  displayName: string;
  businessLocation: string;
  contactEmail: string;
  bio: string;
  supportedPlatforms: string[];
  verificationStatus: VerificationStatus;
  verified: boolean;
}

interface TunerSummary {
  displayName: string;
  verificationStatus: VerificationStatus;
}

@Injectable()
export class TunerService {
  private readonly profilesById = new Map<string, TunerProfile>();
  private readonly profileIdByUserId = new Map<string, string>();

  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  requestVerification(
    userId: string,
    body: {
      displayName: string;
      businessLocation: string;
      contactEmail: string;
      bio?: string;
      supportedPlatforms?: string[];
    }
  ) {
    const displayName = body.displayName?.trim();
    const businessLocation = body.businessLocation?.trim();
    const contactEmail = body.contactEmail?.trim().toLowerCase();
    const bio = body.bio?.trim() ?? "";
    const supportedPlatforms = (body.supportedPlatforms ?? []).map((platform) => platform.trim()).filter((platform) => platform.length > 0);

    if (!displayName || !businessLocation || !contactEmail || !contactEmail.includes("@")) {
      throw new BadRequestException("Display name, location, and contact email are required");
    }

    const existingProfileId = this.profileIdByUserId.get(userId);
    if (existingProfileId) {
      const existing = this.profilesById.get(existingProfileId);
      if (existing) {
        existing.displayName = displayName;
        existing.businessLocation = businessLocation;
        existing.contactEmail = contactEmail;
        existing.bio = bio;
        existing.supportedPlatforms = supportedPlatforms;
        existing.verificationStatus = "pending";
        existing.verified = false;
        this.authService.updateUserRole(userId, "buyer");
        return { profile: existing };
      }
    }

    const profile: TunerProfile = {
      id: randomUUID(),
      userId,
      displayName,
      businessLocation,
      contactEmail,
      bio,
      supportedPlatforms,
      verificationStatus: "pending",
      verified: false
    };

    this.profilesById.set(profile.id, profile);
    this.profileIdByUserId.set(userId, profile.id);

    return { profile };
  }

  approve(profileId: string) {
    const profile = this.profilesById.get(profileId);
    if (!profile) {
      throw new NotFoundException("Tuner profile not found");
    }

    profile.verificationStatus = "approved";
    profile.verified = true;
    this.authService.updateUserRole(profile.userId, "tuner");
    return { profile };
  }

  reject(profileId: string) {
    const profile = this.profilesById.get(profileId);
    if (!profile) {
      throw new NotFoundException("Tuner profile not found");
    }

    profile.verificationStatus = "rejected";
    profile.verified = false;
    this.authService.updateUserRole(profile.userId, "buyer");
    return { profile };
  }

  getTunerSummary(userId: string): TunerSummary {
    const profileId = this.profileIdByUserId.get(userId);
    if (!profileId) {
      return {
        displayName: "Unverified tuner",
        verificationStatus: "rejected"
      };
    }

    const profile = this.profilesById.get(profileId);
    if (!profile) {
      return {
        displayName: "Unverified tuner",
        verificationStatus: "rejected"
      };
    }

    return {
      displayName: profile.displayName,
      verificationStatus: profile.verificationStatus
    };
  }

  getPublicProfile(profileId: string): {
    id: string;
    userId: string;
    displayName: string;
    bio: string;
    supportedPlatforms: string[];
    verificationStatus: VerificationStatus;
    verificationLabel: string;
    trustMetrics: {
      installs: number;
      averageRating: number | null;
      supportResponseMedianHours: number | null;
    };
  } {
    const profile = this.profilesById.get(profileId);
    if (!profile) {
      throw new NotFoundException("Tuner profile not found");
    }

    return {
      id: profile.id,
      userId: profile.userId,
      displayName: profile.displayName,
      bio: profile.bio,
      supportedPlatforms: profile.supportedPlatforms,
      verificationStatus: profile.verificationStatus,
      verificationLabel: profile.verificationStatus === "approved" ? "Verified" : "Unverified",
      trustMetrics: {
        installs: 0,
        averageRating: null,
        supportResponseMedianHours: null
      }
    };
  }
}
