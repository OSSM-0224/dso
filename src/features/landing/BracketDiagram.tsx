import React from 'react';
import { Icon } from '@/components/ui/Icon.tsx';

const MatchCard: React.FC<{
  label: string;
  home: string;
  away: string;
}> = ({ label, home, away }) => (
  <div className="flex flex-col justify-center rounded-[7px] border border-hairline bg-canvas/60 px-2.5 py-2">
    <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
      {label}
    </p>
    <div className="mt-1.5 space-y-1">
      {[home, away].map((team) => (
        <div
          key={team}
          className="flex items-center justify-between gap-2 text-[10.5px] text-ink"
        >
          <span className="truncate">{team}</span>
          <span className="font-mono text-[9px] text-muted">–</span>
        </div>
      ))}
    </div>
  </div>
);

export const BracketDiagram: React.FC = () => (
  <div className="relative w-full min-w-0">
    <div
      role="img"
      aria-label="Illustrative eight-team single-elimination bracket from quarter-finals to a champion."
      className="w-full rounded-[14px] border border-hairline bg-surface p-4 shadow-raise sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
            Draw structure
          </p>
          <p className="mt-1 text-[13px] font-semibold text-ink">
            Play-in single elimination
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-accent-soft bg-accent-soft px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-accent-strong">
          <Icon name="users" size="xs" />
          8 teams
        </span>
      </div>

      <div className="mt-5 w-full max-w-full touch-pan-x overflow-x-auto overscroll-x-contain pb-1 -mx-2 sm:mx-0 px-2 sm:px-0">
        <div className="min-w-[420px] sm:min-w-[460px] lg:min-w-0">
          <div className="grid grid-cols-[1.2fr_0.95fr_0.8fr_0.7fr] gap-2 border-b border-hairline pb-2">
            {['Quarter-final', 'Semi-final', 'Final', 'Champion'].map((round) => (
              <p
                key={round}
                className="font-mono text-[8px] uppercase tracking-[0.13em] text-muted"
              >
                {round}
              </p>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-[1.2fr_0.95fr_0.8fr_0.7fr] gap-2">
            <div className="grid grid-rows-4 gap-1.5">
              <MatchCard label="QF 01" home="Seed 01" away="Seed 08" />
              <MatchCard label="QF 02" home="Seed 04" away="Seed 05" />
              <MatchCard label="QF 03" home="Seed 02" away="Seed 07" />
              <MatchCard label="QF 04" home="Seed 03" away="Seed 06" />
            </div>

            <div className="grid grid-rows-2 gap-1.5 py-5">
              <MatchCard label="SF 01" home="Winner QF 01" away="Winner QF 02" />
              <MatchCard label="SF 02" home="Winner QF 03" away="Winner QF 04" />
            </div>

            <div className="flex items-center">
              <div className="w-full">
                <MatchCard
                  label="Final"
                  home="Winner SF 01"
                  away="Winner SF 02"
                />
              </div>
            </div>

            <div className="flex items-center">
              <div className="flex w-full flex-col items-center justify-center rounded-[9px] border border-accent/25 bg-accent-soft px-2.5 py-5 text-center">
                <Icon name="trophy" size="lg" className="text-accent" />
                <p className="mt-2 font-serif text-[15px] font-semibold leading-tight text-accent-strong">
                  Champion
                </p>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-accent-strong/80">
                  On the field
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.12em] text-muted sm:hidden">
        Swipe to follow the draw
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline pt-3">
        {['Champion separation', 'School conflict checks', 'Play-in byes'].map(
          (item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1.5 text-[10px] text-muted"
            >
              <Icon name="check" size="xs" className="text-accent" />
              {item}
            </span>
          )
        )}
      </div>
    </div>

    <div className="absolute -bottom-4 right-0 hidden items-center gap-2 rounded-[9px] border border-hairline bg-surface px-3 py-2 shadow-raise sm:flex">
      <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-accent-soft text-accent">
        <Icon name="shieldCheck" size="sm" />
      </span>
      <span>
        <span className="block text-[10px] font-semibold text-ink">
          Fair draw verified
        </span>
        <span className="block font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
          Rules applied
        </span>
      </span>
    </div>
  </div>
);
