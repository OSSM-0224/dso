/**
 * Extracted logic of the old `routes/participantAdminRoutes.ts` Express
 * handler bodies (staff-only surface).
 */
import { ApiError } from '../apiError.ts';
import { acknowledgementRepository } from '../repositories/acknowledgementRepository.ts';
import { auditLogRepository } from '../repositories/auditLogRepository.ts';
import { schoolRepository } from '../repositories/schoolRepository.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { passwordService } from '../services/passwordService.ts';
import { UserSession } from '../../shared/types.ts';

export async function listParticipants() {
  const allUsers = await userRepository.findAll();
  const participants = allUsers.filter((u) => u.role === 'participant');

  const enriched = await Promise.all(
    participants.map(async (p) => {
      const school = p.schoolId ? await schoolRepository.findById(p.schoolId) : null;
      const acks = p.schoolId ? await acknowledgementRepository.findBySchoolId(p.schoolId) : [];
      return {
        id: p.id,
        name: p.name,
        email: p.email || null,
        phone: p.phone || null,
        schoolId: p.schoolId,
        schoolName: school?.name || p.schoolName || 'Unknown School',
        schoolCode: p.schoolCode || null,
        mustChangePassword: p.mustChangePassword,
        isActive: p.isActive,
        lastLoginAt: p.lastLoginAt || null,
        createdAt: p.createdAt,
        acknowledgementCount: acks.length,
      };
    })
  );

  return enriched;
}

export async function createParticipant(
  user: UserSession,
  data: {
    schoolId: string;
    name: string;
    email?: string;
    phone?: string;
    schoolCode?: string;
    temporaryPassword: string;
  }
) {
  const { schoolId, name, email, phone, schoolCode, temporaryPassword } = data;

  const school = await schoolRepository.findById(schoolId);
  if (!school) {
    throw new ApiError(404, 'School not found');
  }

  const existingForSchool = await userRepository.findBySchoolId(schoolId);
  if (existingForSchool) {
    throw new ApiError(
      400,
      `School "${school.name}" already has an account (${existingForSchool.schoolCode || existingForSchool.email}). You can reset the password instead.`
    );
  }

  let finalSchoolCode = schoolCode ? schoolCode.trim().toUpperCase() : '';
  if (!finalSchoolCode) {
    const acronym = school.name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    finalSchoolCode = `${acronym.slice(0, 4) || 'SCH'}${randomSuffix}`;
  }

  const existingByCode = await userRepository.findBySchoolCode(finalSchoolCode);
  if (existingByCode) {
    throw new ApiError(
      400,
      `School Code "${finalSchoolCode}" is already in use. Please specify a different code.`
    );
  }

  if (email && email.trim()) {
    const existingByEmail = await userRepository.findByEmail(email.trim());
    if (existingByEmail) {
      throw new ApiError(400, `Email "${email}" is already in use by another account.`);
    }
  }

  const { salt, hash } = passwordService.hashPassword(temporaryPassword);

  const newUser = await userRepository.create({
    name: name.trim(),
    email: email && email.trim() ? email.trim().toLowerCase() : undefined,
    phone: phone && phone.trim() ? phone.trim() : undefined,
    role: 'participant',
    schoolId,
    schoolName: school.name,
    schoolCode: finalSchoolCode,
    passwordHash: hash,
    salt,
    mustChangePassword: true,
    isActive: true,
    lastLoginAt: null,
  });

  await auditLogRepository.create({
    tournamentId: 'system',
    who: user.name,
    role: user.role,
    what: 'create_participant',
    before: null,
    after: {
      userId: newUser.id,
      schoolId,
      schoolName: school.name,
      schoolCode: finalSchoolCode,
    },
    details: `Created participant login for school "${school.name}" with School Code "${finalSchoolCode}"`,
  });

  return {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    phone: newUser.phone,
    schoolId: newUser.schoolId,
    schoolName: school.name,
    schoolCode: finalSchoolCode,
    mustChangePassword: newUser.mustChangePassword,
    isActive: newUser.isActive,
    temporaryPassword,
  };
}

export async function resetParticipantPassword(
  user: UserSession,
  userId: string,
  newTemporaryPassword: string
) {
  const target = await userRepository.findById(userId);
  if (!target || target.role !== 'participant') {
    throw new ApiError(404, 'Participant account not found');
  }

  const { salt, hash } = passwordService.hashPassword(newTemporaryPassword);

  await userRepository.update(target.id, {
    passwordHash: hash,
    salt,
    mustChangePassword: true,
  });

  await auditLogRepository.create({
    tournamentId: 'system',
    who: user.name,
    role: user.role,
    what: 'reset_password',
    before: null,
    after: { userId: target.id, mustChangePassword: true },
    details: `Reset password for participant account "${target.name}" (${target.schoolName || target.schoolCode})`,
  });

  return {
    id: target.id,
    schoolCode: target.schoolCode,
    newTemporaryPassword,
  };
}

export async function toggleParticipantStatus(user: UserSession, userId: string, isActive: boolean) {
  const target = await userRepository.findById(userId);
  if (!target || target.role !== 'participant') {
    throw new ApiError(404, 'Participant account not found');
  }

  if (typeof isActive !== 'boolean') {
    throw new ApiError(400, 'isActive boolean is required');
  }

  const updated = await userRepository.update(target.id, { isActive });

  await auditLogRepository.create({
    tournamentId: 'system',
    who: user.name,
    role: user.role,
    what: 'toggle_participant_status',
    before: { isActive: target.isActive },
    after: { isActive },
    details: `${isActive ? 'Reactivated' : 'Deactivated'} participant account for "${target.schoolName || target.name}"`,
  });

  return updated;
}
