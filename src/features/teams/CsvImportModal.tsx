import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { api } from '@/lib/api.ts';
// Type-only dependency: CsvImportReport/CsvImportRow live in src/shared/types.ts
// (team re-exports them for the server side) so this client component never
// reaches into src/server.
import { CsvImportReport, CsvImportRow } from '@/shared/types.ts';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [csvText, setCsvText] = useState('');
  const [report, setReport] = useState<CsvImportReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const sampleCsv = `schoolName,teamName,medium,ageGroup,gender
New Horizon Public School (NHPS),NHPS Boys Marathi A,Marathi,U-14,boys
New Horizon Public School (NHPS),NHPS Boys English A,English,U-14,boys
Modern School (MNR Sanpada),MNR Boys Marathi,Marathi,U-14,boys
Modern School (MNR Sanpada),MNR Boys English,English,U-14,boys
Bharati Vidyapeeth High School (BVPT),BVPT Boys Marathi,Marathi,U-14,boys
DAV Public School Nerul,DAV Boys English,English,U-14,boys
St. Augustine High School,St. Augustine Marathi,Marathi,U-14,boys
Father Agnel Vashi,Father Agnel Boys,English,U-14,boys`;

  const parseCsv = (text: string): CsvImportRow[] => {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error('CSV must have a header row and at least one data row.');
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const schoolIdx = header.indexOf('schoolname');
    const teamIdx = header.indexOf('teamname');
    const mediumIdx = header.indexOf('medium');
    const ageIdx = header.indexOf('agegroup');
    const genderIdx = header.indexOf('gender');

    if (schoolIdx === -1 || teamIdx === -1 || mediumIdx === -1 || ageIdx === -1 || genderIdx === -1) {
      throw new Error(
        'CSV header must include all 5 columns: schoolName, teamName, medium, ageGroup, gender'
      );
    }

    const rows: CsvImportRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      // Split with handling for basic commas
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 5) continue;

      rows.push({
        schoolName: cols[schoolIdx] || '',
        teamName: cols[teamIdx] || '',
        medium: cols[mediumIdx] || '',
        ageGroup: (cols[ageIdx] as any) || 'U-14',
        gender: (cols[genderIdx]?.toLowerCase() as any) || 'boys',
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
      handlePreview(content);
    };
    reader.readAsText(file);
  };

  const handlePreview = async (textToValidate?: string) => {
    const text = textToValidate || csvText;
    if (!text.trim()) {
      setError('Please provide CSV data to preview.');
      return;
    }

    try {
      setIsValidating(true);
      setError(null);
      const rows = parseCsv(text);
      const res = await api.teams.importCsv(rows, false);
      setReport(res);
    } catch (err: any) {
      setError(err.message || 'Failed to parse and validate CSV');
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
      const validRows = report.items.filter((i) => i.status === 'valid').map((i) => i.data);
      const res = await api.teams.importCsv(validRows, true);
      setSuccessMsg(`Successfully imported ${res.createdCount} team(s)!`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to commit import');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 border border-slate-200 max-h-[90vh] flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Bulk Import Teams via CSV
            </h3>
            <p className="text-xs text-slate-500">
              Columns: <span className="font-mono text-slate-700">schoolName, teamName, medium, ageGroup, gender</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 shrink-0">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-200 shrink-0">
            {successMsg}
          </div>
        )}

        {/* Upload & Paste Area */}
        {!report && (
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2">
                <label className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded cursor-pointer shadow-sm">
                  Upload .CSV File
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-slate-500">or paste CSV text below</span>
              </div>
              <button
                type="button"
                onClick={() => setCsvText(sampleCsv)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Load Sample Template
              </button>
            </div>

            <div>
              <textarea
                rows={10}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="schoolName,teamName,medium,ageGroup,gender&#10;NHPS,NHPS Marathi A,Marathi,U-14,boys"
                className="w-full text-xs font-mono p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        {/* Preview Table */}
        {report && (
          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            {/* Status counts banner */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-500 block">Total Rows</span>
                <span className="font-mono font-bold text-slate-900">{report.totalRows}</span>
              </div>
              <div className="p-2 bg-emerald-50 rounded border border-emerald-200">
                <span className="text-[10px] text-emerald-700 block">Valid to Import</span>
                <span className="font-mono font-bold text-emerald-700">{report.validCount}</span>
              </div>
              <div className="p-2 bg-amber-50 rounded border border-amber-200">
                <span className="text-[10px] text-amber-700 block">Duplicates</span>
                <span className="font-mono font-bold text-amber-700">{report.duplicateCount}</span>
              </div>
              <div className="p-2 bg-red-50 rounded border border-red-200">
                <span className="text-[10px] text-red-700 block">Errors</span>
                <span className="font-mono font-bold text-red-700">{report.errorCount}</span>
              </div>
            </div>

            {/* Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-500 text-[11px] font-semibold text-left">
                  <tr>
                    <th className="px-3 py-2 w-12">#</th>
                    <th className="px-3 py-2">School</th>
                    <th className="px-3 py-2">Team Name</th>
                    <th className="px-3 py-2">Medium</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Status / Validation</th>
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
                      <td className="px-3 py-2 font-mono text-slate-400">{item.rowIndex}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{item.data.schoolName}</div>
                        <span className="text-[10px] text-slate-400">
                          {item.schoolExists ? 'Existing school' : 'Will create school'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900">{item.data.teamName}</td>
                      <td className="px-3 py-2 text-slate-600">{item.data.medium}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {item.data.ageGroup} · <span className="capitalize">{item.data.gender}</span>
                      </td>
                      <td className="px-3 py-2">
                        {item.status === 'valid' && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <Icon name=`"check`" size=`"sm`" />Ready
                          </span>
                        )}
                        {item.status === 'duplicate' && (
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                              Duplicate ({item.duplicateOf})
                            </span>
                            <div className="text-[10px] text-amber-700">{item.errors[0]}</div>
                          </div>
                        )}
                        {item.status === 'error' && (
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-red-800 bg-red-100 px-1.5 py-0.5 rounded">
                              Error
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
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
          {report ? (
            <button
              type="button"
              onClick={() => setReport(null)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
            >
              ← Edit CSV Data
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>

            {!report ? (
              <button
                type="button"
                onClick={() => handlePreview()}
                disabled={isValidating || !csvText.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md shadow-sm disabled:opacity-50"
              >
                {isValidating ? 'Validating...' : 'Preview & Validate CSV'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={isImporting || report.validCount === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md shadow-sm disabled:opacity-50"
              >
                {isImporting
                  ? 'Saving...'
                  : `Import ${report.validCount} Valid Team(s)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
