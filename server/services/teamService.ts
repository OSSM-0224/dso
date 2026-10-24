import { schoolRepository } from '../repositories/schoolRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { TeamDoc } from '../../shared/types.ts';

export interface CsvImportRow {
  schoolName: string;
  teamName: string;
  medium: string;
  ageGroup: 'U-14' | 'U-17' | 'U-19' | 'Open';
  gender: 'boys' | 'girls';
}

export interface CsvValidationItem {
  rowIndex: number;
  data: CsvImportRow;
  status: 'valid' | 'duplicate' | 'error';
  errors: string[];
  warnings: string[];
  schoolExists: boolean;
  duplicateOf?: 'csv' | 'database';
}

export interface CsvImportReport {
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  errorCount: number;
  items: CsvValidationItem[];
  committed?: boolean;
  createdCount?: number;
}

export class TeamService {
  async validateAndImportCsv(
    rows: CsvImportRow[],
    commit: boolean = false
  ): Promise<CsvImportReport> {
    const existingTeams = await teamRepository.findAll();
    const existingSchools = await schoolRepository.findAll();

    const schoolMapByName = new Map<string, typeof existingSchools[0]>();
    existingSchools.forEach((s) => schoolMapByName.set(s.name.trim().toLowerCase(), s));

    const items: CsvValidationItem[] = [];
    const seenInCsv = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const errors: string[] = [];
      const warnings: string[] = [];

      const schoolNameTrimmed = (row.schoolName || '').trim();
      const teamNameTrimmed = (row.teamName || '').trim();
      const mediumTrimmed = (row.medium || '').trim();
      const ageGroup = row.ageGroup;
      const gender = (row.gender || '').toLowerCase() as 'boys' | 'girls';

      // Required field validations
      if (!schoolNameTrimmed) errors.push('School name is required');
      if (!teamNameTrimmed) errors.push('Team name is required');
      if (!mediumTrimmed) errors.push('Instruction medium is required');
      if (!['U-14', 'U-17', 'U-19', 'Open'].includes(ageGroup)) {
        errors.push(`Invalid age group "${ageGroup}". Allowed: U-14, U-17, U-19, Open`);
      }
      if (!['boys', 'girls'].includes(gender)) {
        errors.push(`Invalid gender "${gender}". Allowed: boys, girls`);
      }

      // Check school existence
      const existingSchool = schoolMapByName.get(schoolNameTrimmed.toLowerCase());
      const schoolExists = Boolean(existingSchool);
      if (existingSchool && !existingSchool.mediums.map((m) => m.toLowerCase()).includes(mediumTrimmed.toLowerCase())) {
        warnings.push(`School "${existingSchool.name}" does not list "${mediumTrimmed}" medium (will be added to school).`);
      } else if (!existingSchool) {
        warnings.push(`School "${schoolNameTrimmed}" is new and will be created automatically.`);
      }

      // Duplicate detection within CSV
      const csvKey = `${schoolNameTrimmed.toLowerCase()}|${teamNameTrimmed.toLowerCase()}|${ageGroup}|${gender}|${mediumTrimmed.toLowerCase()}`;
      let isDuplicate = false;
      let duplicateOf: 'csv' | 'database' | undefined;

      if (seenInCsv.has(csvKey)) {
        isDuplicate = true;
        duplicateOf = 'csv';
        errors.push('Duplicate entry within the same CSV upload.');
      } else {
        seenInCsv.add(csvKey);
      }

      // Duplicate detection against database
      if (!isDuplicate && existingSchool) {
        const dbMatch = existingTeams.find(
          (t) =>
            t.schoolId === existingSchool.id &&
            t.name.toLowerCase() === teamNameTrimmed.toLowerCase() &&
            t.ageGroup === ageGroup &&
            t.gender === gender
        );
        if (dbMatch) {
          isDuplicate = true;
          duplicateOf = 'database';
          errors.push(`Team already exists in database (School: ${dbMatch.schoolName}, Medium: ${dbMatch.medium}).`);
        }
      }

      let status: 'valid' | 'duplicate' | 'error' = 'valid';
      if (isDuplicate) {
        status = 'duplicate';
      } else if (errors.length > 0) {
        status = 'error';
      }

      items.push({
        rowIndex: i + 1,
        data: {
          schoolName: schoolNameTrimmed,
          teamName: teamNameTrimmed,
          medium: mediumTrimmed,
          ageGroup,
          gender,
        },
        status,
        errors,
        warnings,
        schoolExists,
        duplicateOf,
      });
    }

    const validCount = items.filter((item) => item.status === 'valid').length;
    const duplicateCount = items.filter((item) => item.status === 'duplicate').length;
    const errorCount = items.filter((item) => item.status === 'error').length;

    let createdCount = 0;

    // If commit requested, create schools and teams
    if (commit && validCount > 0) {
      const validItems = items.filter((item) => item.status === 'valid');

      for (const item of validItems) {
        const { schoolName, teamName, medium, ageGroup, gender } = item.data;

        // 1. Get or create school
        let school = schoolMapByName.get(schoolName.toLowerCase());
        if (!school) {
          school = await schoolRepository.create({
            name: schoolName,
            mediums: [medium],
          });
          schoolMapByName.set(schoolName.toLowerCase(), school);
        } else if (!school.mediums.includes(medium)) {
          school = (await schoolRepository.update(school.id, {
            mediums: [...school.mediums, medium],
          }))!;
          schoolMapByName.set(schoolName.toLowerCase(), school);
        }

        // 2. Create team
        await teamRepository.create({
          name: teamName,
          schoolId: school.id,
          medium,
          ageGroup,
          gender,
          isActive: true,
        });

        createdCount++;
      }
    }

    return {
      totalRows: rows.length,
      validCount,
      duplicateCount,
      errorCount,
      items,
      committed: commit,
      createdCount,
    };
  }
}

export const teamService = new TeamService();
