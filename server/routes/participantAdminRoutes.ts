import { Router, Request, Response, NextFunction } from 'express';
import { userRepository } from '../repositories/userRepository.ts';
import { schoolRepository } from '../repositories/schoolRepository.ts';
import { auditLogRepository } from '../repositories/auditLogRepository.ts';
import { acknowledgementRepository } from '../repositories/acknowledgementRepository.ts';
import { passwordService } from '../services/passwordService.ts';
import { requireAdminOrOrganizer } from '../middlewares/authMiddleware.ts';
import { validateBody } from '../middlewares/validationMiddleware.ts';
import { createParticipantSchema, resetPasswordSchema } from '../validations/schemas.ts';

const router = Router();

// Apply admin/organizer authorization to all routes in this router
router.use(requireAdminOrOrganizer);

/**
 * GET /api/admin/participants - list all school participant accounts
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const allUsers = await userRepository.findAll();
    const participants = allUsers.filter((u) => u.role === 'participant');

    // Enrich with school information and acknowledgement counts
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

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/participants - create a participant account for a school
 */
router.post(
  '/',
  validateBody(createParticipantSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { schoolId, name, email, phone, schoolCode, temporaryPassword } = req.body;

      const school = await schoolRepository.findById(schoolId);
      if (!school) {
        return res.status(404).json({ success: false, error: 'School not found' });
      }

      // Check if school already has an account
      const existingForSchool = await userRepository.findBySchoolId(schoolId);
      if (existingForSchool) {
        return res.status(400).json({
          success: false,
          error: `School "${school.name}" already has an account (${existingForSchool.schoolCode || existingForSchool.email}). You can reset the password instead.`,
        });
      }

      // Generate or normalize school code
      let finalSchoolCode = schoolCode ? schoolCode.trim().toUpperCase() : '';
      if (!finalSchoolCode) {
        // Auto-generate code from school name acronym, e.g. "Father Agnel" -> "FAS", "Navi Mumbai" -> "NM"
        const acronym = school.name
          .split(/\s+/)
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '');
        const randomSuffix = Math.floor(100 + Math.random() * 900);
        finalSchoolCode = `${acronym.slice(0, 4) || 'SCH'}${randomSuffix}`;
      }

      // Verify code uniqueness
      const existingByCode = await userRepository.findBySchoolCode(finalSchoolCode);
      if (existingByCode) {
        return res.status(400).json({
          success: false,
          error: `School Code "${finalSchoolCode}" is already in use. Please specify a different code.`,
        });
      }

      if (email && email.trim()) {
        const existingByEmail = await userRepository.findByEmail(email.trim());
        if (existingByEmail) {
          return res.status(400).json({
            success: false,
            error: `Email "${email}" is already in use by another account.`,
          });
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

      // Audit log
      await auditLogRepository.create({
        tournamentId: 'system',
        who: req.user!.name,
        role: req.user!.role,
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

      res.status(201).json({
        success: true,
        data: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          phone: newUser.phone,
          schoolId: newUser.schoolId,
          schoolName: school.name,
          schoolCode: finalSchoolCode,
          mustChangePassword: newUser.mustChangePassword,
          isActive: newUser.isActive,
          temporaryPassword, // returned once upon creation for organizer convenience
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/admin/participants/:id/reset-password - reset password for a participant
 */
router.put(
  '/:id/reset-password',
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userRepository.findById(req.params.id);
      if (!user || user.role !== 'participant') {
        return res.status(404).json({ success: false, error: 'Participant account not found' });
      }

      const { newTemporaryPassword } = req.body;
      const { salt, hash } = passwordService.hashPassword(newTemporaryPassword);

      await userRepository.update(user.id, {
        passwordHash: hash,
        salt,
        mustChangePassword: true,
      });

      await auditLogRepository.create({
        tournamentId: 'system',
        who: req.user!.name,
        role: req.user!.role,
        what: 'reset_password',
        before: null,
        after: { userId: user.id, mustChangePassword: true },
        details: `Reset password for participant account "${user.name}" (${user.schoolName || user.schoolCode})`,
      });

      res.json({
        success: true,
        message: 'Password reset successfully. User will be required to change password on next login.',
        data: {
          id: user.id,
          schoolCode: user.schoolCode,
          newTemporaryPassword,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/admin/participants/:id/status - activate or deactivate an account
 */
router.put('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userRepository.findById(req.params.id);
    if (!user || user.role !== 'participant') {
      return res.status(404).json({ success: false, error: 'Participant account not found' });
    }

    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, error: 'isActive boolean is required' });
    }

    const updated = await userRepository.update(user.id, { isActive });

    await auditLogRepository.create({
      tournamentId: 'system',
      who: req.user!.name,
      role: req.user!.role,
      what: 'toggle_participant_status',
      before: { isActive: user.isActive },
      after: { isActive },
      details: `${isActive ? 'Reactivated' : 'Deactivated'} participant account for "${user.schoolName || user.name}"`,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
