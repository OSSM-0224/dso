'use client';

/**
 * LEGACY link /score/:matchId — resolves the match's tournament server-side
 * and redirects to the isolated tournament-scoped console
 * /score/:tournamentId/:matchId. Falls back to the picker when the match (or
 * its tournament) no longer exists.
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api.ts';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';

export default function ScoreLegacyRedirectPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [status, setStatus] = useState<'resolving' | 'missing'>('resolving');

  useEffect(() => {
    const matchId = window.location.pathname.split('/')[2];
    let cancelled = false;

    api.scoring
      .myMatches()
      .then((matches) => {
        if (cancelled) return;
        const match = matches.find((m) => m.matchId === matchId);
        if (match) {
          router.replace(`/score/${match.tournamentId}/${match.matchId}`);
        } else {
          setStatus('missing');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      {status === 'resolving' ? (
        <>
          <Icon name="spinner" size="md" spin /> {t('Opening the scoring console…')}
        </>
      ) : (
        <>
          <Icon name="circleAlert" size="md" /> {t('Match not found — back to the tournament picker.')}
        </>
      )}
    </div>
  );
}
