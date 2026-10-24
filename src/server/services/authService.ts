import jwt from 'jsonwebtoken';
import { userRepository } from '../repositories/userRepository.ts';
import { schoolRepository } from '../repositories/schoolRepository.ts';
import { auditLogRepository } from '../repositories/auditLogRepository.ts';
import { passwordService } from './passwordService.ts';
import { UserDoc, UserRole, UserSession } from '../../shared/types.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'dso-navi-mumbai-kho-kho-fixtures-jwt-secret-key-2026';

interface FailedAttemptTracker {
  count: number;
  lastAttempt: number;
}

export class AuthService {
  // Rate limiting tracker: identifier -> { count, lastAttempt }
  private failedAttempts = new Map<string, FailedAttemptTracker>();
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 mins

  generateToken(user: UserSession): string {
    return jwt.sign(
      {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email,
        phone: user.phone,
        schoolId: user.schoolId,
        schoolName: user.schoolName,
        schoolCode: user.schoolCode,
        mustChangePassword: user.mustChangePassword,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  verifyToken(token: string): UserSession | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      return {
        id: decoded.id,
        name: decoded.name,
        role: decoded.role as UserRole,
        email: decoded.email,
        phone: decoded.phone,
        schoolId: decoded.schoolId,
        schoolName: decoded.schoolName,
        schoolCode: decoded.schoolCode,
        mustChangePassword: decoded.mustChangePassword,
      };
    } catch {
      return null;
    }
  }

  /**
   * Participant / School login supporting School Code, Email, or Phone.
   * Includes rate limiting protection.
   */
  async login(
    identifier: string,
    password: string,
    clientIp: string = 'client'
  ): Promise<{ user: UserSession; token: string; mustChangePassword: boolean }> {
    const rateLimitKey = `${clientIp}:${identifier.toLowerCase().trim()}`;
    const now = Date.now();
    const rateRecord = this.failedAttempts.get(rateLimitKey);

    if (rateRecord && rateRecord.count >= this.MAX_FAILED_ATTEMPTS) {
      const timeLeft = Math.ceil((rateRecord.lastAttempt + this.LOCKOUT_WINDOW_MS - now) / 1000 / 60);
      if (timeLeft > 0) {
        throw new Error(
          `Too many failed login attempts. Account temporarily locked. Please try again in ${timeLeft} minutes.`
        );
      } else {
        // Lockout expired, reset
        this.failedAttempts.delete(rateLimitKey);
      }
    }

    const user = await userRepository.findByIdentifier(identifier);
    if (!user) {
      this.recordFailedAttempt(rateLimitKey);
      throw new Error('Invalid credentials. Please verify your School Code or Email and Password.');
    }

    if (!user.isActive) {
      throw new Error('This school account has been deactivated. Please contact the DSO organizer.');
    }

    const isValidPassword = passwordService.verifyPassword(
      password,
      user.salt,
      user.passwordHash
    );

    if (!isValidPassword) {
      this.recordFailedAttempt(rateLimitKey);
      throw new Error('Invalid credentials. Please verify your School Code or Email and Password.');
    }

    // Success: clear rate limit tracker
    this.failedAttempts.delete(rateLimitKey);

    // Update lastLoginAt
    const nowIso = new Date().toISOString();
    await userRepository.update(user.id, { lastLoginAt: nowIso });

    let schoolName = user.schoolName;
    if (!schoolName && user.schoolId) {
      const school = await schoolRepository.findById(user.schoolId);
      schoolName = school?.name;
    }

    const session: UserSession = {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      phone: user.phone,
      schoolId: user.schoolId,
      schoolName,
      schoolCode: user.schoolCode,
      mustChangePassword: user.mustChangePassword,
    };

    const token = this.generateToken(session);

    return {
      user: session,
      token,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private recordFailedAttempt(key: string) {
    const current = this.failedAttempts.get(key) || { count: 0, lastAttempt: Date.now() };
    this.failedAttempts.set(key, {
      count: current.count + 1,
      lastAttempt: Date.now(),
    });
  }

  /**
   * Forces password change on first login or when requested by user.
   */
  async changePassword(
    userId: string,
    currentPassword?: string,
    newPassword?: string
  ): Promise<{ user: UserSession; token: string }> {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    // If not first-time mandatory reset, verify current password
    if (!user.mustChangePassword && currentPassword) {
      const validCurrent = passwordService.verifyPassword(
        currentPassword,
        user.salt,
        user.passwordHash
      );
      if (!validCurrent) {
        throw new Error('Current password is incorrect.');
      }
    }

    const { salt, hash } = passwordService.hashPassword(newPassword);
    const updated = await userRepository.update(user.id, {
      passwordHash: hash,
      salt,
      mustChangePassword: false,
    });

    if (!updated) {
      throw new Error('Failed to update password.');
    }

    await auditLogRepository.create({
      tournamentId: 'system',
      who: user.name,
      role: user.role,
      what: 'change_password',
      before: null,
      after: null,
      details: `Password changed for account "${user.name}" (${user.schoolCode || user.email})`,
    });

    const session: UserSession = {
      id: updated.id,
      name: updated.name,
      role: updated.role,
      email: updated.email,
      phone: updated.phone,
      schoolId: updated.schoolId,
      schoolName: updated.schoolName,
      schoolCode: updated.schoolCode,
      mustChangePassword: false,
    };

    const token = this.generateToken(session);
    return { user: session, token };
  }

  /**
   * Helper to create role sessions for DSO roles: Admin, Organizer, Viewer.
   */
  createRoleSession(role: UserRole): { user: UserSession; token: string } {
    const roleNames: Record<UserRole, string> = {
      admin: 'DSO Admin (District Sports Officer)',
      organizer: 'Tournament Organizer (Navi Mumbai)',
      viewer: 'Public Spectator / School Coach',
      participant: 'School Participant',
    };

    const user: UserSession = {
      id: `usr-${role}`,
      name: roleNames[role] || 'User',
      role,
      email: `${role}@dso-navimumbai.gov.in`,
    };

    const token = this.generateToken(user);
    return { user, token };
  }
}

export const authService = new AuthService();
