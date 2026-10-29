'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api.ts';
import { AuditLogDoc } from '@/shared/types.ts';
import { useI18n } from '@/i18n/LanguageProvider.tsx';

interface AuditLogScreenProps {
  tournamentId: string;
}

export const AuditLogScreen: React.FC<AuditLogScreenProps> = ({ tournamentId }) => {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLogDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, [tournamentId]);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.tournaments.getAuditLog(tournamentId);
      setLogs(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  const getActionBadgeClass = (what: AuditLogDoc['what']) => {
    switch (what) {
      case 'generate':
      case 'regenerate':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'manual_swap':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'publish':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'result_entry':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'schedule_update':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-xs text-slate-400">
        {t('Loading tournament audit logs...')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
        {t(error)}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            {t('Tournament Audit Log')}
          </h3>
          <p className="text-xs text-slate-500">
            {t('Immutable tracking of fixture generation, manual swaps, publish actions, and match score entries.')}
          </p>
        </div>
        <button
          onClick={loadLogs}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {t('Refresh Log')}
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          {t('No audit entries recorded for this tournament yet.')}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {logs.map((log) => (
            <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${getActionBadgeClass(
                      log.what
                    )}`}
                  >
                    {log.what.replace('_', ' ')}
                  </span>
                  <span className="font-semibold text-slate-900">{log.who}</span>
                  <span className="text-[11px] text-slate-400">({log.role})</span>
                </div>
                <div className="text-slate-700 text-xs leading-relaxed">
                  {log.details}
                </div>
              </div>

              <div className="text-right text-[11px] text-slate-400 font-mono shrink-0">
                {new Date(log.timestamp).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
