import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

export type UserRole = "buyer" | "tuner" | "admin";

interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  emailVerified: boolean;
}

interface SessionPayload {
  userId: string;
}

interface SignupResult {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
  };
  verificationToken: string;
}

interface LoginResult {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    role: UserRole;
  };
  sessionToken: string;
}

@Injectable()
export class AuthService {
  private readonly usersById = new Map<string, UserRecord>();
  private readonly userIdByEmail = new Map<string, string>();
  private readonly verificationTokenToUserId = new Map<string, string>();
  private readonly resetTokenToUserId = new Map<string, string>();
  private readonly sessionSecret = "ptm-local-session-secret";

  async signup(email: string, password: string): Promise<SignupResult> {
    const normalizedEmail = this.normalizeEmail(email);
    this.validatePassword(password);

    if (this.userIdByEmail.has(normalizedEmail)) {
      throw new ConflictException("Email already in use");
    }

    const userId = randomUUID();
    const user: UserRecord = {
      id: userId,
      email: normalizedEmail,
      passwordHash: await argon2.hash(password),
      role: "buyer",
      emailVerified: false
    };

    this.usersById.set(user.id, user);
    this.userIdByEmail.set(normalizedEmail, user.id);

    const verificationToken = randomUUID();
    this.verificationTokenToUserId.set(verificationToken, user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified
      },
      verificationToken
    };
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = this.normalizeEmail(email);
    const userId = this.userIdByEmail.get(normalizedEmail);

    if (!userId) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const user = this.usersById.get(userId);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isValid = await argon2.verify(user.passwordHash, password);
    if (!isValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const sessionToken = jwt.sign({ userId: user.id }, this.sessionSecret, { expiresIn: "1d" });

    return {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role
      },
      sessionToken
    };
  }

  updateUserRole(userId: string, role: UserRole): void {
    const user = this.usersById.get(userId);
    if (!user) {
      throw new BadRequestException("User not found");
    }

    user.role = role;
  }

  verifyEmail(token: string): void {
    const userId = this.verificationTokenToUserId.get(token);
    if (!userId) {
      throw new BadRequestException("Invalid verification token");
    }

    const user = this.usersById.get(userId);
    if (!user) {
      throw new BadRequestException("Invalid verification token");
    }

    user.emailVerified = true;
    this.verificationTokenToUserId.delete(token);
  }

  requestPasswordReset(email: string): { resetToken?: string } {
    const normalizedEmail = this.normalizeEmail(email);
    const userId = this.userIdByEmail.get(normalizedEmail);

    if (!userId) {
      return {};
    }

    const resetToken = randomUUID();
    this.resetTokenToUserId.set(resetToken, userId);
    return { resetToken };
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    this.validatePassword(newPassword);

    const userId = this.resetTokenToUserId.get(token);
    if (!userId) {
      throw new BadRequestException("Invalid reset token");
    }

    const user = this.usersById.get(userId);
    if (!user) {
      throw new BadRequestException("Invalid reset token");
    }

    user.passwordHash = await argon2.hash(newPassword);
    this.resetTokenToUserId.delete(token);
  }

  validateSessionToken(token: string): SessionPayload {
    try {
      const payload = jwt.verify(token, this.sessionSecret) as jwt.JwtPayload;
      const userId = payload.userId;

      if (typeof userId !== "string") {
        throw new UnauthorizedException("Authentication required");
      }

      return { userId };
    } catch {
      throw new UnauthorizedException("Authentication required");
    }
  }

  getUserById(userId: string): { id: string; email: string; emailVerified: boolean; role: UserRole } {
    const user = this.usersById.get(userId);
    if (!user) {
      throw new UnauthorizedException("Authentication required");
    }

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role
    };
  }

  isPurchaseReady(userId: string): boolean {
    const user = this.getUserById(userId);
    return user.emailVerified;
  }

  private normalizeEmail(email: string): string {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) {
      throw new BadRequestException("Invalid email");
    }
    return normalized;
  }

  private validatePassword(password: string): void {
    if (password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }
  }
}
