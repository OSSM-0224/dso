'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { MatchDoc, TeamDoc } from '@/shared/types.ts';

interface BracketViewProps {
  matches: MatchDoc[];
  strongTeamIds?: string[];
  championTeamIds?: string[];
  onSelectTeamForSwap?: (team: TeamDoc) => void;
  selectedTeamForSwap?: TeamDoc | null;
  onEnterResult?: (match: MatchDoc) => void;
  onEditSchedule?: (match: MatchDoc) => void;
  isInteractive?: boolean;
  canWrite?: boolean;
}

const BracketViewInner: React.FC<BracketViewProps> = ({
  matches,
  strongTeamIds = [],
  championTeamIds = [],
  onSelectTeamForSwap,
  selectedTeamForSwap,
  onEnterResult,
  onEditSchedule,
  isInteractive = true,
  canWrite = false,
}) => {
  const { t } = useI18n();
  if (matches.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        {t("No matches generated yet.")}
      </div>
    );
  }

  // Group matches by round
  const maxRound = Math.max(...matches.map((m) => m.round));
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  const getRoundTitle = (round: number, totalRounds: number, matchesInRound: MatchDoc[]) => {
    if (round === totalRounds) return t('Final');
    if (round === totalRounds - 1) return t('Semi Finals');
    if (round === totalRounds - 2) return t('Quarter Finals');
    if (round === 1) {
      const realMatches = matchesInRound.filter((m) => !m.isBye);
      const byeMatches = matchesInRound.filter((m) => m.isBye);
      if (byeMatches.length > 0) {
        return t("Round 1 (Play-In) - {matchCount} {matchLabel}, {byeCount} {byeLabel}", {
          matchCount: realMatches.length,
          matchLabel: realMatches.length === 1 ? t('Match') : t('Matches'),
          byeCount: byeMatches.length,
          byeLabel: byeMatches.length === 1 ? t('Bye') : t('Byes'),
        });
      }
      return t("Round 1 (Play-In) - {count} {label}", {
        count: realMatches.length,
        label: realMatches.length === 1 ? t('Match') : t('Matches'),
      });
    }
    return t("Round {round}", { round });
  };

  const getMatchMetaLabel = (match: MatchDoc, round: number, totalRounds: number, indexInRound: number) => {
    // Semi-finals: "Semi Final 1" and "Semi Final 2"
    if (round === totalRounds - 1) {
      return t("Semi Final {number}", { number: indexInRound + 1 });
    }
    // Final: "Final"
    if (round === totalRounds) {
      return t('Final');
    }
    // Quarter-finals and earlier: Q-labels if available
    if (round === totalRounds - 2) {
      return `Q${match.quarter || indexInRound + 1}`;
    }
    if (match.quarter) {
      return `Q${match.quarter}`;
    }
    return null;
  };

  // Strong teams and champions are strictly private organizer-only details. Never visible to schools or public.
  const isStrong = (teamId?: string) => Boolean(canWrite && teamId && strongTeamIds.includes(teamId));
  const isChampion = (teamId?: string) => Boolean(canWrite && teamId && championTeamIds.includes(teamId));

  return (
    <div className="w-full">
      {/* Scroll hint for small screens only */}
      <div className="mb-1.5 flex justify-end lg:hidden px-2">
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          {t("Swipe to view later rounds")} <Icon name="arrowRight" size="xs" />
        </span>
      </div>
      <div className="w-full overflow-x-auto pb-6 pt-2 touch-pan-x touch-pan-y -mx-2 sm:mx-0 px-2 sm:px-0">
        <div className="flex gap-4 sm:gap-6 lg:gap-8 min-w-[520px] sm:min-w-[640px] lg:min-w-[800px] items-stretch">
        {rounds.map((round) => {
          const allRoundMatches = matches
            .filter((m) => m.round === round)
            .sort((a, b) => a.matchNumber - b.matchNumber);

          // For Round 1: only show real matches (not byes)
          const isRound1 = round === 1;
          const realMatches = isRound1
            ? allRoundMatches.filter((m) => !m.isBye)
            : allRoundMatches;
          const byeMatchesInR1 = isRound1
            ? allRoundMatches.filter((m) => m.isBye)
            : [];

          return (
            <div key={round} className="flex-1 flex flex-col min-w-[240px] sm:min-w-[280px]">
              {/* Round Column Header */}
              <div className="mb-4 pb-2 border-b border-slate-200 text-center">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-800">
                  {getRoundTitle(round, maxRound, allRoundMatches)}
                </h4>
                <span className="text-[11px] text-slate-400">
                  {isRound1 && byeMatchesInR1.length > 0
                    ? t("{realCount} Real {realLabel} · {byeCount} Byes", {
                        realCount: realMatches.length,
                        realLabel: realMatches.length === 1 ? t('Match') : t('Matches'),
                        byeCount: byeMatchesInR1.length,
                      })
                    : t("{count} {label}", {
                        count: realMatches.length,
                        label: realMatches.length === 1 ? t('Match') : t('Matches'),
                      })}
                </span>
              </div>

              {/* Match Nodes */}
              <div className="flex flex-col justify-around flex-grow gap-4">
                {realMatches.length === 0 && isRound1 ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs text-slate-500">
                    {t("No play-in matches required. All teams advance directly to next round.")}
                  </div>
                ) : (
                  realMatches.map((match, matchIndex) => {
                    const isBye = match.isBye;
                    const isWinnerA = match.winner?.id && match.winner.id === match.teamA?.id;
                    const isWinnerB = match.winner?.id && match.winner.id === match.teamB?.id;

                    const canSwapA =
                      isInteractive &&
                      round === 1 &&
                      match.teamA &&
                      onSelectTeamForSwap &&
                      canWrite;
                    const canSwapB =
                      isInteractive &&
                      round === 1 &&
                      match.teamB &&
                      onSelectTeamForSwap &&
                      canWrite;

                    const metaLabel = getMatchMetaLabel(match, round, maxRound, matchIndex);

                    return (
                      <div
                        key={match.id}
                        className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:border-slate-300 transition-colors relative"
                      >
                        {/* Match Meta (Number & Schedule) */}
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                          <span className="font-semibold text-slate-600">
                            M#{match.matchNumber} {metaLabel ? `· ${metaLabel}` : ''}
                          </span>
                          {match.scheduledAt ? (
                            <span className="truncate max-w-[120px] text-slate-500 font-mono">
                              {new Date(match.scheduledAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })}{' '}
                              {new Date(match.scheduledAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          ) : match.venue ? (
                            <span className="truncate max-w-[120px] text-slate-500">{match.venue}</span>
                          ) : null}
                        </div>

                        {/* Team A */}
                        <div
                          onClick={() => canSwapA && onSelectTeamForSwap(match.teamA!)}
                          className={`flex items-center justify-between p-2 rounded text-xs transition-colors ${
                            canSwapA ? 'cursor-pointer hover:bg-slate-50' : ''
                          } ${
                            selectedTeamForSwap?.id === match.teamA?.id
                              ? 'bg-amber-50 ring-2 ring-amber-400'
                              : isWinnerA
                              ? 'bg-emerald-50 text-emerald-900 font-medium'
                              : 'text-slate-800'
                          }`}
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="truncate font-medium">
                                {match.teamA ? match.teamA.name : <span className="text-slate-400 italic">{t("TBD")}</span>}
                              </span>
                              {isStrong(match.teamA?.id) && (
                                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1 rounded font-semibold shrink-0">
                                  {t("Strong")}
                                </span>
                              )}
                              {isChampion(match.teamA?.id) && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded font-semibold shrink-0">
                                  {t("Champ")}
                                </span>
                              )}
                            </div>
                            {match.teamA && (
                              <span className="text-[10px] text-slate-400 truncate">
                                {match.teamA.schoolName} · {match.teamA.medium}
                              </span>
                            )}
                          </div>
                          <span className="font-mono font-bold text-xs shrink-0 tabular-nums">
                            {match.score?.teamAScore !== undefined ? match.score.teamAScore : isWinnerA ? <Icon name="circleCheck" size="sm" /> : ''}
                          </span>
                        </div>

                        <div className="my-1 border-t border-slate-100" />

                        {/* Team B / BYE */}
                        {isBye ? (
                          <div className="flex items-center justify-between p-2 rounded text-xs bg-slate-50 text-slate-400">
                            <span className="font-medium tracking-wide">{t("BYE: advances to next round")}</span>
                            <span className="text-[10px] text-emerald-600 font-medium">{t("Adv.")}</span>
                          </div>
                        ) : (
                          <div
                            onClick={() => canSwapB && onSelectTeamForSwap(match.teamB!)}
                            className={`flex items-center justify-between p-2 rounded text-xs transition-colors ${
                              canSwapB ? 'cursor-pointer hover:bg-slate-50' : ''
                            } ${
                              selectedTeamForSwap?.id === match.teamB?.id
                                ? 'bg-amber-50 ring-2 ring-amber-400'
                                : isWinnerB
                                ? 'bg-emerald-50 text-emerald-900 font-medium'
                                : 'text-slate-800'
                            }`}
                          >
                            <div className="flex flex-col min-w-0 pr-2">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate font-medium">
                                  {match.teamB ? match.teamB.name : <span className="text-slate-400 italic">{t("TBD")}</span>}
                                </span>
                                {isStrong(match.teamB?.id) && (
                                  <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1 rounded font-semibold shrink-0">
                                    {t("Strong")}
                                  </span>
                                )}
                                {isChampion(match.teamB?.id) && (
                                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded font-semibold shrink-0">
                                    {t("Champ")}
                                  </span>
                                )}
                              </div>
                              {match.teamB && (
                                <span className="text-[10px] text-slate-400 truncate">
                                  {match.teamB.schoolName} · {match.teamB.medium}
                                </span>
                              )}
                            </div>
                            <span className="font-mono font-bold text-xs shrink-0 tabular-nums">
                              {match.score?.teamBScore !== undefined ? match.score.teamBScore : isWinnerB ? <Icon name="circleCheck" size="sm" /> : ''}
                            </span>
                          </div>
                        )}

                        {/* Actions footer if tournament is published/ongoing and user has write access */}
                        {canWrite && !isBye && match.teamA && match.teamB && (
                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 min-w-0">
                            {onEditSchedule && (
                              <button
                                onClick={() => onEditSchedule(match)}
                                className="text-[11px] py-0.5 text-slate-500 hover:text-slate-800 transition-colors shrink-0"
                              >
                                Schedule
                              </button>
                            )}
                            {onEnterResult && match.status !== 'completed' && (
                              <button
                                onClick={() => onEnterResult(match)}
                                className="text-[11px] py-0.5 font-medium text-indigo-600 hover:text-indigo-800 transition-colors shrink-0"
                              >
                                Enter Result
                              </button>
                            )}
                            {match.status === 'completed' && match.winner && (
                              <span className="text-[10px] text-emerald-600 font-medium truncate min-w-0">
                                Winner: {match.winner.name}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Compact BYE List for Round 1:
                    "show them as a compact 'BYE -> advances to Quarter Finals' list below" */}
                {isRound1 && byeMatchesInR1.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-dashed border-slate-200">
                    <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200 text-[11px] flex-wrap">
                        <span className="font-semibold text-emerald-800 flex items-center gap-1.5">
                          <span>🛡️</span>
                          <span>BYE → advances to Quarter Finals</span>
                        </span>
                        <span className="shrink-0 text-[10px] font-mono text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          {byeMatchesInR1.length} {byeMatchesInR1.length === 1 ? 'Team' : 'Teams'}
                        </span>
                      </div>

                      <div className="space-y-1.5 max-h-[280px] sm:max-h-[360px] overflow-y-auto pr-1">
                        {byeMatchesInR1.map((byeMatch) => {
                          const byeTeam = byeMatch.teamA || byeMatch.winner;
                          if (!byeTeam) return null;

                          const canSwapBye =
                            isInteractive &&
                            onSelectTeamForSwap &&
                            canWrite;

                          return (
                            <div
                              key={byeMatch.id}
                              onClick={() => canSwapBye && onSelectTeamForSwap(byeTeam)}
                              className={`flex items-center justify-between p-2 rounded text-xs bg-white border transition-colors ${
                                canSwapBye ? 'cursor-pointer hover:border-slate-300' : ''
                              } ${
                                selectedTeamForSwap?.id === byeTeam.id
                                  ? 'bg-amber-50 ring-2 ring-amber-400 border-amber-300'
                                  : 'border-slate-200'
                              }`}
                              title={canSwapBye ? 'Click to select for manual swap' : undefined}
                            >
                              <div className="flex flex-col min-w-0 pr-2">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="font-medium text-slate-900 truncate">
                                    {byeTeam.name}
                                  </span>
                                  {isStrong(byeTeam.id) && (
                                    <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1 rounded font-semibold shrink-0">
                                      Strong
                                    </span>
                                  )}
                                  {isChampion(byeTeam.id) && (
                                    <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-semibold shrink-0">
                                      Champ
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 truncate">
                                  {byeTeam.schoolName} · {byeTeam.medium}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                  QF Bye <Icon name="check" size="xs" />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
};

// Memoized: the bracket tree is expensive to re-render; skip re-renders when
// the parent re-runs but props are unchanged (same matches/slots/callbacks).
export const BracketView: React.FC<BracketViewProps> = React.memo(BracketViewInner);
