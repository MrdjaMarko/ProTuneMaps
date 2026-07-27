import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export interface VehicleSetup {
  id: string;
  userId: string;
  make: string;
  model: string;
  year: number;
  engine: string;
  ecuId: string;
  transmission: string;
  fuelType: string;
  installedMods: string[];
}

interface CreateVehicleSetupInput {
  make: string;
  model: string;
  year: number;
  engine: string;
  ecuId: string;
  transmission: string;
  fuelType: string;
  installedMods: string[];
}

interface UpdateVehicleSetupInput {
  make?: string;
  model?: string;
  year?: number;
  engine?: string;
  ecuId?: string;
  transmission?: string;
  fuelType?: string;
  installedMods?: string[];
}

@Injectable()
export class VehicleSetupsService {
  private readonly setupsById = new Map<string, VehicleSetup>();
  private readonly setupIdsByUser = new Map<string, Set<string>>();

  create(userId: string, input: CreateVehicleSetupInput): VehicleSetup {
    const setup: VehicleSetup = {
      id: randomUUID(),
      userId,
      make: this.requireNonEmpty(input.make, "make"),
      model: this.requireNonEmpty(input.model, "model"),
      year: this.requireYear(input.year),
      engine: this.requireNonEmpty(input.engine, "engine"),
      ecuId: this.requireNonEmpty(input.ecuId, "ecuId"),
      transmission: this.requireNonEmpty(input.transmission, "transmission"),
      fuelType: this.requireNonEmpty(input.fuelType, "fuelType"),
      installedMods: this.normalizeMods(input.installedMods)
    };

    this.setupsById.set(setup.id, setup);

    const userSetups = this.setupIdsByUser.get(userId) ?? new Set<string>();
    userSetups.add(setup.id);
    this.setupIdsByUser.set(userId, userSetups);

    return setup;
  }

  listByUser(userId: string): VehicleSetup[] {
    const ids = this.setupIdsByUser.get(userId);
    if (!ids) {
      return [];
    }

    return [...ids]
      .map((id) => this.setupsById.get(id))
      .filter((setup): setup is VehicleSetup => Boolean(setup));
  }

  update(userId: string, setupId: string, input: UpdateVehicleSetupInput): VehicleSetup {
    const setup = this.getOwnedSetup(userId, setupId);

    if (input.make !== undefined) {
      setup.make = this.requireNonEmpty(input.make, "make");
    }
    if (input.model !== undefined) {
      setup.model = this.requireNonEmpty(input.model, "model");
    }
    if (input.year !== undefined) {
      setup.year = this.requireYear(input.year);
    }
    if (input.engine !== undefined) {
      setup.engine = this.requireNonEmpty(input.engine, "engine");
    }
    if (input.ecuId !== undefined) {
      setup.ecuId = this.requireNonEmpty(input.ecuId, "ecuId");
    }
    if (input.transmission !== undefined) {
      setup.transmission = this.requireNonEmpty(input.transmission, "transmission");
    }
    if (input.fuelType !== undefined) {
      setup.fuelType = this.requireNonEmpty(input.fuelType, "fuelType");
    }
    if (input.installedMods !== undefined) {
      setup.installedMods = this.normalizeMods(input.installedMods);
    }

    return setup;
  }

  delete(userId: string, setupId: string): void {
    const setup = this.getOwnedSetup(userId, setupId);
    this.setupsById.delete(setup.id);

    const ids = this.setupIdsByUser.get(userId);
    ids?.delete(setup.id);
  }

  getSetupForCompatibility(userId: string, setupId: string): VehicleSetup {
    return this.getOwnedSetup(userId, setupId);
  }

  private getOwnedSetup(userId: string, setupId: string): VehicleSetup {
    const setup = this.setupsById.get(setupId);
    if (!setup || setup.userId !== userId) {
      throw new NotFoundException("Vehicle setup not found");
    }

    return setup;
  }

  private requireNonEmpty(value: string, fieldName: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }
    return normalized;
  }

  private requireYear(year: number): number {
    if (!Number.isInteger(year) || year < 1950 || year > 2100) {
      throw new BadRequestException("year must be a valid model year");
    }
    return year;
  }

  private normalizeMods(mods: string[]): string[] {
    if (!Array.isArray(mods)) {
      throw new BadRequestException("installedMods must be an array");
    }

    return mods
      .map((mod) => mod.trim())
      .filter((mod) => mod.length > 0);
  }
}
