'use client';

import React, { useEffect, useState } from 'react';

import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { TournamentDoc } from '@/shared/types.ts';

interface FixturePrintHeaderProps {
  tournament: TournamentDoc;
  /** Short document label printed at the top-right of the sheet. */
  documentLabel: string;
}

/**
 * Print-only letterhead for the fixture sheet.
 *
 * Screen-only chrome (app header, page headers, controls) is hidden while
 * printing, so every printed fixture page starts with this compact identity
 * block: organisation, tournament name, category, status and print date.
 */
export const FixturePrintHeader: React.FC<FixturePrintHeaderProps> = ({
  tournament,
  documentLabel,
}) => {
  const { t } = useI18n();
  const [printedOn, setPrintedOn] = useState('');

  useEffect(() => {
    setPrintedOn(
      new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    );
  }, []);

  const statusLabel = tournament.status.replace(/-/g, ' ');

  return (
    <header className="fixture-print-header">
      <div className="fixture-print-identity">
        <div className="fixture-print-org">
          <span className="fixture-print-crest" aria-hidden="true">
            DSO
          </span>
          <span>{t('District Sports Office (DSO) Navi Mumbai')}</span>
        </div>

        <h1 className="fixture-print-title">{tournament.name}</h1>

        <p className="fixture-print-meta">
          <strong>{tournament.sport.toUpperCase()}</strong>
          <span aria-hidden="true">·</span>
          <span>{tournament.ageGroup}</span>
          <span aria-hidden="true">·</span>
          <span className="capitalize">{tournament.gender}</span>
          <span aria-hidden="true">·</span>
          <span>{t('Year {year}', { year: tournament.year })}</span>
          <span aria-hidden="true">·</span>
          <span className="capitalize">{statusLabel}</span>
        </p>

        {tournament.status === 'completed' && tournament.winnerName && (
          <p className="fixture-print-winner">
            {t('Champion: {name}', { name: tournament.winnerName })}
          </p>
        )}
      </div>

      <div className="fixture-print-document">
        <p className="fixture-print-document-label">{t(documentLabel)}</p>
        <span className="fixture-print-document-rule" aria-hidden="true" />
        {printedOn && (
          <p className="fixture-print-document-date">
            {t('Printed {date}', { date: printedOn })}
          </p>
        )}
      </div>
    </header>
  );
};

interface FixturePrintFooterProps {
  /** Left-hand provenance note, e.g. "Official fixture sheet". */
  note: string;
}

/** Print-only footer pinned to the bottom of the fixture sheet. */
export const FixturePrintFooter: React.FC<FixturePrintFooterProps> = ({ note }) => {
  const { t } = useI18n();

  return (
    <footer className="fixture-print-footer">
      <span>{t(note)}</span>
      <span>{t('District Sports Office (DSO) Navi Mumbai')}</span>
    </footer>
  );
};
