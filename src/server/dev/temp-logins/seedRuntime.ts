import 'server-only';
// TEMP-LOGIN: remove later
import mongoose from 'mongoose';
import { dbStore } from '../../db/memoryStore.ts';
import { userRepository } from '../../repositories/userRepository.ts';
import { schoolRepository } from '../../repositories/schoolRepository.ts';
import { passwordService } from '../../services/passwordService.ts';

const TEMP_PASSWORD = process.env.TEMP_LOGIN_PASSWORD || 'DSO@2026';

export async function runTempLoginSeed(options?: { remove?: boolean; tempPassword?: string }) {
  // Hard safety: refuse to run if in production
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[TEMP-LOGIN: ABORT]: Temporary login seeding is strictly forbidden in production mode (NODE_ENV=production).');
  }
  const remove = options?.remove;
  const pwd = options?.tempPassword || TEMP_PASSWORD;

  // Connect to MongoDB if MONGODB_URI is provided
  let connectedMongo = false;
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      connectedMongo = true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[TEMP-LOGIN]: MongoDB connect failed, using memory store fallback:', message);
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

    // 2b. Seed two dedicated LIVE SCORER accounts (LIVE SCORER module)
    const scorerSeeds = [
      { name: 'Match Scorer One', email: 'scorer@dso.gov.in', code: 'SCORER' },
      { name: 'Match Scorer Two', email: 'scorer2@dso.gov.in', code: 'SCORER2' },
    ];
    for (const sc of scorerSeeds) {
      let scorer = await userRepository.findByEmail(sc.email);
      if (!scorer) {
        scorer = await userRepository.findBySchoolCode(sc.code);
      }
      if (scorer) {
        await userRepository.update(scorer.id, {
          role: 'scorer',
          passwordHash: hash,
          salt,
          mustChangePassword: false,
          isActive: true,
          isTempSeed: true,
        });
        console.log(`[TEMP-LOGIN]: Updated existing Scorer account (${sc.email})`);
      } else {
        await userRepository.create({
          name: sc.name,
          email: sc.email,
          schoolCode: sc.code,
          role: 'scorer',
          passwordHash: hash,
          salt,
          mustChangePassword: false,
          isActive: true,
          isTempSeed: true,
        });
        console.log(`[TEMP-LOGIN]: Created Scorer account (${sc.email} / ${sc.code})`);
      }
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
      `[TEMP-LOGIN]: Completed successfully. Seeded 1 Admin, 1 Organizer, 2 Scorers, and ${schoolAccountsCount} School accounts with shared password "${pwd}".`
    );
    return {
      action: 'seeded',
      admin: 'ADMIN or admin@dso.gov.in',
      organizer: 'ORGANIZER or organizer@dso.gov.in',
      scorers: ['SCORER or scorer@dso.gov.in', 'SCORER2 or scorer2@dso.gov.in'],
      schoolAccountsCount,
      password: pwd,
    };
  } finally {
    if (connectedMongo) {
      await mongoose.disconnect();
    }
  }
}
