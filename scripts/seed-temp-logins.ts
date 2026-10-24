// TEMP-LOGIN: remove later
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { dbStore } from '../src/server/db/memoryStore.ts';
import { userRepository } from '../src/server/repositories/userRepository.ts';
import { schoolRepository } from '../src/server/repositories/schoolRepository.ts';
import { passwordService } from '../src/server/services/passwordService.ts';
import { UserDoc } from '../src/shared/types.ts';

dotenv.config();

const TEMP_PASSWORD = process.env.TEMP_LOGIN_PASSWORD || 'DSO@2026';
const isRemoveMode = process.argv.includes('--remove') || process.argv.includes('remove');

export async function runTempLoginSeed(options?: { remove?: boolean; tempPassword?: string }) {
  // Hard safety: refuse to run if in production
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[TEMP-LOGIN: ABORT]: Temporary login seeding is strictly forbidden in production mode (NODE_ENV=production).');
  }
  const remove = options?.remove ?? isRemoveMode;
  const pwd = options?.tempPassword || TEMP_PASSWORD;

  // Connect to MongoDB if MONGODB_URI is provided
  let connectedMongo = false;
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      connectedMongo = true;
    } catch (err: any) {
      console.warn('[TEMP-LOGIN]: MongoDB connect failed, using memory store fallback:', err.message);
    }
  }

  try {
    if (remove) {
      console.log('[TEMP-LOGIN]: Removing all temporary seeded accounts...');
      let removedCount = 0;
      const allUsers = await userRepository.findAll();
      for (const u of allUsers) {
        if (u.isTempSeed) {
          await userRepository.delete(u.id);
          removedCount++;
        }
      }
      console.log(`[TEMP-LOGIN]: Successfully removed ${removedCount} temporary seeded accounts.`);
      return { action: 'removed', count: removedCount };
    }

    console.log('[TEMP-LOGIN]: Running temporary seeded login accounts generation...');
    const { salt, hash } = passwordService.hashPassword(pwd);

    // 1. Seed or Update Admin account
    let admin = await userRepository.findByEmail('admin@dso.gov.in');
    if (!admin) {
      admin = await userRepository.findBySchoolCode('ADMIN');
    }
    if (admin) {
      await userRepository.update(admin.id, {
        passwordHash: hash,
        salt,
        mustChangePassword: false,
        isActive: true,
        isTempSeed: true,
      });
      console.log('[TEMP-LOGIN]: Updated existing Admin account (admin@dso.gov.in)');
    } else {
      await userRepository.create({
        name: 'DSO Admin Officer',
        email: 'admin@dso.gov.in',
        schoolCode: 'ADMIN',
        role: 'admin',
        passwordHash: hash,
        salt,
        mustChangePassword: false,
        isActive: true,
        isTempSeed: true,
      });
      console.log('[TEMP-LOGIN]: Created Admin account (admin@dso.gov.in / ADMIN)');
    }

    // 2. Seed or Update Organizer account
    let organizer = await userRepository.findByEmail('organizer@dso.gov.in');
    if (!organizer) {
      organizer = await userRepository.findBySchoolCode('ORGANIZER');
    }
    if (organizer) {
      await userRepository.update(organizer.id, {
        passwordHash: hash,
        salt,
        mustChangePassword: false,
        isActive: true,
        isTempSeed: true,
      });
      console.log('[TEMP-LOGIN]: Updated existing Organizer account (organizer@dso.gov.in)');
    } else {
      await userRepository.create({
        name: 'Navi Mumbai Tournament Organizer',
        email: 'organizer@dso.gov.in',
        schoolCode: 'ORGANIZER',
        role: 'organizer',
        passwordHash: hash,
        salt,
        mustChangePassword: false,
        isActive: true,
        isTempSeed: true,
      });
      console.log('[TEMP-LOGIN]: Created Organizer account (organizer@dso.gov.in / ORGANIZER)');
    }

    // 3. Seed 1 school account for each School that ALREADY exists in database
    // (Notice: script does NOT create any schools, teams, or matches)
    const existingSchools = await schoolRepository.findAll();
    let schoolAccountsCount = 0;

    for (const school of existingSchools) {
      // Generate short clean school code, e.g. "New Horizon Public School" -> "NHPS"
      const shortCode = school.name
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      const schoolCode = shortCode || `SCH${school.id.slice(-4).toUpperCase()}`;

      let schoolUser = await userRepository.findBySchoolId(school.id);
      if (!schoolUser) {
        schoolUser = await userRepository.findBySchoolCode(schoolCode);
      }

      if (schoolUser) {
        await userRepository.update(schoolUser.id, {
          schoolId: school.id,
          schoolName: school.name,
          schoolCode,
          passwordHash: hash,
          salt,
          mustChangePassword: false,
          isActive: true,
          isTempSeed: true,
        });
        console.log(`[TEMP-LOGIN]: Updated school account: ${school.name} (Code: ${schoolCode})`);
      } else {
        await userRepository.create({
          name: `${school.name} Coach`,
          email: `${schoolCode.toLowerCase()}@school.edu`,
          schoolId: school.id,
          schoolName: school.name,
          schoolCode,
          role: 'participant',
          passwordHash: hash,
          salt,
          mustChangePassword: false,
          isActive: true,
          isTempSeed: true,
        });
        console.log(`[TEMP-LOGIN]: Created school account: ${school.name} (Code: ${schoolCode})`);
      }
      schoolAccountsCount++;
    }

    console.log(
      `[TEMP-LOGIN]: Completed successfully. Seeded 1 Admin, 1 Organizer, and ${schoolAccountsCount} School accounts with shared password "${pwd}".`
    );
    return {
      action: 'seeded',
      admin: 'ADMIN or admin@dso.gov.in',
      organizer: 'ORGANIZER or organizer@dso.gov.in',
      schoolAccountsCount,
      password: pwd,
    };
  } finally {
    if (connectedMongo) {
      await mongoose.disconnect();
    }
  }
}

// If executed directly from CLI via tsx
if (process.argv[1]?.endsWith('seed-temp-logins.ts') || process.argv[1]?.endsWith('seed-temp-logins.js')) {
  runTempLoginSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[TEMP-LOGIN: ERROR]:', err);
      process.exit(1);
    });
}
