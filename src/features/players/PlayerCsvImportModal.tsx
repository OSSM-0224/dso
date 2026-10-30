'use client';
import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { api } from '@/lib/api.ts';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { PlayerCsvImportReport, TeamDoc } from '@/shared/types.ts';

interface PlayerCsvImportModalProps {
  isOpen: boolean;
  /** Teams the caller may import into (already role-scoped by the screen). */
  teams: TeamDoc[];
  onClose: () => void;
  onSuccess: (createdCount: number) => void;
}

export const PlayerCsvImportModal: React.FC<PlayerCsvImportModalProps> = ({
  isOpen,
  teams,
  onClose,
  onSuccess,
}) => {
  const { t } = useI18n();
  const [teamId, setTeamId] = useState<string>('');
  const [csvText, setCsvText] = useState('');
  const [report, setReport] = useState<PlayerCsvImportReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedTeam = teams.find((tm) => tm.id === teamId) || null;

  const sampleCsv = `name,jerseyNumber,dateOfBirth,gender,ageGroup
Aarav Sharma,7,2011-04-12,boys,U-14
Ved Patil,3,2011-08-25,boys,U-14
Ishaan Deshmukh,5,2011-01-30,boys,U-14
Kabir Nair,9,2011-06-18,boys,U-14`;

  const parseCsv = (
    text: string,
  ): Array<{
    name: string;
    jerseyNumber?: number;
    dateOfBirth?: string;
    gender?: 'boys' | 'girls';
    ageGroup?: string;
  }> => {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error(
        t('CSV must have a header row and at least one data row.'),
      );
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const nameIdx = header.indexOf('name');
    const jerseyIdx = header.indexOf('jerseynumber');
    const dobIdx = header.indexOf('dateofbirth');
    const genderIdx = header.indexOf('gender');
    const ageIdx = header.indexOf('agegroup');

    if (nameIdx === -1) {
      throw new Error(
        t('CSV header must include the "name" column (jerseyNumber, dateOfBirth, gender, ageGroup are optional)'),
      );
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]
        .split(',')
        .map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length <= nameIdx && !cols[nameIdx]) continue;

      const jerseyRaw = jerseyIdx !== -1 ? cols[jerseyIdx] : '';
      const jersey = jerseyRaw ? Number(jerseyRaw) : undefined;

      rows.push({
        name: cols[nameIdx] || '',
        jerseyNumber:
          jersey !== undefined && Number.isInteger(jersey) && jersey > 0
            ? jersey
            : undefined,
        dateOfBirth: dobIdx !== -1 ? cols[dobIdx] || undefined : undefined,
        gender:
          genderIdx !== -1 && (cols[genderIdx] === 'boys' || cols[genderIdx] === 'girls')
            ? (cols[genderIdx] as 'boys' | 'girls')
            : undefined,
        ageGroup: ageIdx !== -1 ? cols[ageIdx] || undefined : undefined,
      });
    }

    return rows;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      setCsvText(content);
      setReport(null);
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    if (!teamId) {
      setError(t('Select a team first.'));
      return;
    }
    if (!csvText.trim()) {
      setError(t('Please provide CSV data to preview.'));
      return;
    }

    try {
      setIsValidating(true);
      setError(null);
      const rows = parseCsv(csvText);
      const res = await api.players.importCsv(teamId, rows, false);
      setReport(res);
    } catch (err: any) {
      setError(err.message || t('Failed to parse and validate CSV'));
      setReport(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleCommitImport = async () => {
    if (!report || report.validCount === 0) return;

    try {
      setIsImporting(true);
      setError(null);
      const validRows = report.items
        .filter((i) => i.status === 'valid')
        .map((i) => i.data);
      const res = await api.players.importCsv(teamId, validRows, true);
      setSuccessMsg(
        t('Successfully imported {count} player(s)!', {
          count: res.createdCount ?? 0,
        }),
      );
      setTimeout(() => {
        onSuccess(res.createdCount ?? 0);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || t('Failed to commit import'));
    } finally {
      setIsImporting(false);
    }
  };

  const inputCls =
    'w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 border border-slate-200 max-h-[90vh] flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {t('Bulk Import Players via CSV')}
            </h3>
            <p className="text-xs text-slate-500">
              {t('Columns:')}{' '}
              <span className="font-mono text-slate-700">
                name, jerseyNumber, dateOfBirth, gender, ageGroup
              </span>
              <span className="ml-1 text-slate-400">
                ({t('only "name" is required')})
              </span>
            </p>
          </div>
          <button
            aria-label={t('Close')}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
          >
            <Icon name="xmark" size="sm" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 shrink-0">
            {t(error)}
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-200 shrink-0">
            {t(successMsg)}
          </div>
        )}

        {/* Team picker + upload area */}
        {!report && (
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('Import into Team')} <span className="text-red-600">*</span>
              </label>
              <select
                value={teamId}
                onChange={(e) => {
                  setTeamId(e.target.value);
                  setReport(null);
                }}
                className={inputCls}
              >
                <option value="">{t('Select Team')}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {team.ageGroup}{' '}
                    {team.gender === 'boys' ? t('Boys') : t('Girls')} ·{' '}
                    {team.schoolName}
                  </option>
                ))}
              </select>
              {teams.length === 0 && (
                <span className="text-[10px] text-amber-600">
                  {t(
                    'No teams available yet — create a team before importing players.',
                  )}
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2">
                <label className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded cursor-pointer shadow-sm">
                  {t('Upload .CSV File')}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-slate-500">
                  {t('or paste CSV text below')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCsvText(sampleCsv)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {t('Load Sample Template')}
              </button>
            </div>

            <div>
              <textarea
                rows={10}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="name,jerseyNumber,dateOfBirth,gender,ageGroup&#10;Aarav Sharma,7,2011-04-12,boys,U-14"
                className="w-full text-xs font-mono p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        {/* Preview Table */}
        {report && (
          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-500 block">
                  {t('Total Rows')}
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {report.totalRows}
                </span>
              </div>
              <div className="p-2 bg-emerald-50 rounded border border-emerald-200">
                <span className="text-[10px] text-emerald-700 block">
                  {t('Valid to Import')}
                </span>
                <span className="font-mono font-bold text-emerald-700">
                  {report.validCount}
                </span>
              </div>
              <div className="p-2 bg-amber-50 rounded border border-amber-200">
                <span className="text-[10px] text-amber-700 block">
                  {t('Duplicates')}
                </span>
                <span className="font-mono font-bold text-amber-700">
                  {report.duplicateCount}
                </span>
              </div>
              <div className="p-2 bg-red-50 rounded border border-red-200">
                <span className="text-[10px] text-red-700 block">
                  {t('Errors')}
                </span>
                <span className="font-mono font-bold text-red-700">
                  {report.errorCount}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              {t('Target team')}:{' '}
              <span className="font-semibold text-slate-700">
                {report.teamName}
              </span>
            </p>

            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-500 text-[11px] font-semibold text-left">
                  <tr>
                    <th className="px-3 py-2 w-12">#</th>
                    <th className="px-3 py-2">{t('Player Name')}</th>
                    <th className="px-3 py-2">{t('Jersey')}</th>
                    <th className="px-3 py-2">{t('Date of Birth')}</th>
                    <th className="px-3 py-2">{t('Status / Validation')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {report.items.map((item) => (
                    <tr
                      key={item.rowIndex}
                      className={
                        item.status === 'valid'
                          ? 'hover:bg-slate-50'
                          : item.status === 'duplicate'
                            ? 'bg-amber-50/30'
                            : 'bg-red-50/30'
                      }
                    >
                      <td className="px-3 py-2 font-mono text-slate-400">
                        {item.rowIndex}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {item.data.name}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600">
                        {item.data.jerseyNumber ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {item.data.dateOfBirth || '—'}
                      </td>
                      <td className="px-3 py-2">
                        {item.status === 'valid' && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <Icon name="check" size="sm" />
                            {t('Ready')}
                          </span>
                        )}
                        {item.status === 'duplicate' && (
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                              {t('Duplicate ({name})', {
                                name: item.duplicateOf ?? '',
                              })}
                            </span>
                            <div className="text-[10px] text-amber-700">
                              {item.errors[0]}
                            </div>
                          </div>
                        )}
                        {item.status === 'error' && (
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-red-800 bg-red-100 px-1.5 py-0.5 rounded">
                              {t('Error')}
                            </span>
                            <div className="text-[10px] text-red-700 font-mono">
                              {item.errors.join('; ')}
                            </div>
                          </div>
                        )}
                        {item.warnings.length > 0 && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.warnings.join(' ')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {report ? (
            <button
              type="button"
              onClick={() => setReport(null)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium whitespace-nowrap"
            >
              {t('← Edit CSV Data')}
            </button>
          ) : (
            <div />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md"
            >
              {t('Cancel')}
            </button>

            {!report ? (
              <button
                type="button"
                onClick={handlePreview}
                disabled={
                  isValidating || !csvText.trim() || !teamId || !selectedTeam
                }
                className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isValidating
                  ? t('Validating...')
                  : t('Preview & Validate CSV')}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={isImporting || report.validCount === 0}
                className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md shadow-sm disabled:opacity-50"
              >
                {isImporting
                  ? t('Saving...')
                  : t('Import {count} Player(s)', {
                      count: report.validCount,
                    })}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
