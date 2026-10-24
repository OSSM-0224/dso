import 'server-only';
import crypto from 'crypto';

/**
 * Cryptographically secure password hashing and verification using PBKDF2.
 */
export class PasswordService {
  private readonly iterations = 10000;
  private readonly keyLength = 64;
  private readonly digest = 'sha512';

  hashPassword(password: string): { salt: string; hash: string } {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, salt, this.iterations, this.keyLength, this.digest)
      .toString('hex');
    return { salt, hash };
  }

  verifyPassword(password: string, salt: string, storedHash: string): boolean {
    const hash = crypto
      .pbkdf2Sync(password, salt, this.iterations, this.keyLength, this.digest)
      .toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
  }
}

export const passwordService = new PasswordService();
