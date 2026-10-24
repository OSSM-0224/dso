// TEMP-LOGIN: remove later
import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';

interface QuickLoginDropdownProps {
  onSelect: (identifier: string, password: string) => void;
  portalType?: 'school' | 'admin' | 'scorer' | 'any';
}

export const QuickLoginDropdown: React.FC<QuickLoginDropdownProps> = ({
  onSelect,
  portalType = 'any',
}) => {
  // Hard safety: refuse to render if in production
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  // Check flag: NEXT_PUBLIC_ENABLE_TEMP_LOGINS or VITE_ENABLE_TEMP_LOGINS
  const isEnabled =
    typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_ENABLE_TEMP_LOGINS === 'true' ||
      process.env.VITE_ENABLE_TEMP_LOGINS === 'true' ||
      (typeof import.meta !== 'undefined' &&
        (import.meta as any).env?.VITE_ENABLE_TEMP_LOGINS === 'true' ||
        (import.meta as any).env?.NEXT_PUBLIC_ENABLE_TEMP_LOGINS === 'true'));

  if (!isEnabled) {
    return null;
  }

  const [accounts, setAccounts] = useState<Array<{ label: string; identifier: string; role: string }>>([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    // Fetch available seeded accounts from dev endpoint
    fetch('/api/dev/temp-logins')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && Array.isArray(json.data)) {
          setAccounts(json.data);
        }
      })
      .catch(() => {
        // Fallback static list of standard seeded accounts
        const list = [
          { label: 'Admin (DSO District Sports Officer)', identifier: 'ADMIN', role: 'admin' },
          { label: 'Organizer (Tournament Organizer)', identifier: 'ORGANIZER', role: 'organizer' },
          { label: 'School (NHPS - New Horizon)', identifier: 'NHPS', role: 'participant' },
          { label: 'School (MNR - Marathi & Eng)', identifier: 'MNR', role: 'participant' },
          { label: 'School (BVPT - Bharati Vidyapeeth)', identifier: 'BVPT', role: 'participant' },
        ];
        setAccounts(list);
      });
  }, []);

  const filteredAccounts = accounts.filter((acc) => {
    if (portalType === 'school') return acc.role === 'participant';
    if (portalType === 'admin') return acc.role === 'admin' || acc.role === 'organizer';
    if (portalType === 'scorer') return acc.role === 'scorer';
    return true;
  });

  if (filteredAccounts.length === 0) return null;

  return (
    <div className="p-2.5 bg-amber-50/90 border border-amber-200 rounded-xl text-xs space-y-1.5 my-3">
      <div className="flex items-center gap-1.5 text-amber-900 font-bold text-[11px]">
        <Icon name="sparkles" size="sm" className="text-amber-600 shrink-0" />
        <span>Quick login (temporary)</span>
        <span className="text-[10px] text-amber-600 font-normal ml-auto">dev test only</span>
      </div>
      <select
        value={selected}
        onChange={(e) => {
          const val = e.target.value;
          setSelected(val);
          if (val) {
            // Default temp password DSO@2026
            onSelect(val, 'DSO@2026');
          }
        }}
        className="w-full bg-white border border-amber-300 rounded-lg p-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
      >
        <option value="">-- Select test account to autofill --</option>
        {filteredAccounts.map((acc) => (
          <option key={acc.identifier} value={acc.identifier}>
            {acc.label} ({acc.identifier})
          </option>
        ))}
      </select>
    </div>
  );
};
