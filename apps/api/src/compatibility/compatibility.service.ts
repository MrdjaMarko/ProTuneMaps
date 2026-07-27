import { Injectable } from "@nestjs/common";
import type { VehicleSetup } from "../vehicle-setups/vehicle-setups.service";

export type CompatibilityStatus = "Compatible" | "Partially Compatible" | "Not Compatible";

export interface ListingRequirements {
  make?: string;
  model?: string;
  engine?: string;
  ecuId?: string;
  transmission?: string;
  fuelType?: string;
  requiredMods: string[];
}

export interface CompatibilityResult {
  status: CompatibilityStatus;
  missingRequirements: string[];
  mismatchReasons: string[];
}

@Injectable()
export class CompatibilityService {
  evaluate(requirements: ListingRequirements, setup: VehicleSetup): CompatibilityResult {
    const mismatchReasons: string[] = [];
    const missingRequirements: string[] = [];

    this.compareField("make", requirements.make, setup.make, mismatchReasons);
    this.compareField("model", requirements.model, setup.model, mismatchReasons);
    this.compareField("engine", requirements.engine, setup.engine, mismatchReasons);
    this.compareField("ecuId", requirements.ecuId, setup.ecuId, mismatchReasons);
    this.compareField("transmission", requirements.transmission, setup.transmission, mismatchReasons);
    this.compareField("fuelType", requirements.fuelType, setup.fuelType, mismatchReasons);

    const setupMods = new Set(setup.installedMods.map((mod) => mod.trim().toLowerCase()));
    for (const requiredMod of requirements.requiredMods) {
      if (!setupMods.has(requiredMod.trim().toLowerCase())) {
        missingRequirements.push(`required mod missing: ${requiredMod}`);
      }
    }

    if (mismatchReasons.length > 0) {
      return {
        status: "Not Compatible",
        missingRequirements,
        mismatchReasons
      };
    }

    if (missingRequirements.length > 0) {
      return {
        status: "Partially Compatible",
        missingRequirements,
        mismatchReasons
      };
    }

    return {
      status: "Compatible",
      missingRequirements,
      mismatchReasons
    };
  }

  private compareField(field: string, requiredValue: string | undefined, actualValue: string, mismatches: string[]): void {
    if (!requiredValue) {
      return;
    }

    const requiredNormalized = requiredValue.trim().toLowerCase();
    const actualNormalized = actualValue.trim().toLowerCase();

    if (requiredNormalized !== actualNormalized) {
      mismatches.push(`${field} mismatch: required ${requiredValue}, got ${actualValue}`);
    }
  }
}
