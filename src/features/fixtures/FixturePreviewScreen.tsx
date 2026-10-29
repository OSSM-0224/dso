'use client';
import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { BracketView } from '../../components/bracket/BracketView.tsx';
import { api } from '@/lib/api.ts';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { FixtureSnapshotDoc, MatchDoc, TeamDoc, TournamentDoc } from '@/shared/types.ts';

interface FixturePreviewScreenProps {
  tournament: TournamentDoc;
  matches: MatchDoc[];
  snapshot?: FixtureSnapshotDoc | null;
  enrolledTeams: TeamDoc[];
  onRefresh: () => void;
  canWrite: boolean;
}

export const FixturePreviewScreen: React.FC<FixturePreviewScreenProps> = ({
  tournament,
  matches,
  snapshot,
  enrolledTeams,
  onRefresh,
  canWrite,
}) => {
  const { t } = useI18n();
  const [selectedTeamA, setSelectedTeamA] = useState<TeamDoc | null>(null);
  const [selectedTeamB, setSelectedTeamB] = useState<TeamDoc | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [swapWarningModal, setSwapWarningModal] = useState<{
    warnings: string[];
    teamA: TeamDoc;
    teamB: TeamDoc;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const championTeamIds = snapshot?.recentChampionsDetected.map((c) => c.teamId) || [];

  const handleSelectTeamForSwap = (team: TeamDoc) => {
    if (!canWrite) return;
    if (!selectedTeamA) {
      setSelectedTeamA(team);
      setSuccessMsg(t('Selected 1st team: "{name}". Now click another team to swap.', { name: team.name }));
    } else if (selectedTeamA.id === team.id) {
      setSelectedTeamA(null);
      setSuccessMsg(null);
    } else {
      setSelectedTeamB(team);
      triggerSwap(selectedTeamA, team, false);
    }
  };

  const triggerSwap = async (teamA: TeamDoc, teamB: TeamDoc, force: boolean) => {
    try {
      setIsSwapping(true);
      setError(null);
      const res = await api.tournaments.swapFixtures(tournament.id, teamA.id, teamB.id, force);

      if (res.warnings && res.warnings.length > 0 && !force) {
        // Show confirmation modal
        setSwapWarningModal({
          warnings: res.warnings,
          teamA,
          teamB,
        });
        setSelectedTeamB(null);
        return;
      }

      setSwapWarningModal(null);
      setSelectedTeamA(null);
      setSelectedTeamB(null);
      setSuccessMsg(t('Successfully swapped "{teamA}" and "{teamB}".', { teamA: teamA.name, teamB: teamB.name }));
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to swap teams');
    } finally {
      setIsSwapping(false);
    }
  };

  const handleRegenerate = async () => {
    if (!canWrite) return;
    try {
      setIsRegenerating(true);
      setError(null);
      await api.tournaments.generateFixtures(tournament.id);
      setSuccessMsg('Regenerated fixtures with fresh random seed.');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!canWrite) return;
    if (!window.confirm(t('Are you sure you want to lock and publish these fixtures? Once published, matches become official and open for public viewing.'))) {
      return;
    }

    try {
      setIsPublishing(true);
      setError(null);
      await api.tournaments.publish(tournament.id);
      setSuccessMsg('Tournament fixtures locked and published successfully!');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to publish fixtures');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Notices */}
      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
          {t(error)}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-200 flex items-center justify-between">
          <span>{t(successMsg)}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 font-bold ml-4" aria-label={t("Dismiss message")}><Icon name="xmark" size="sm" /></button>
        </div>
      )}

      {/* Snapshot & Warnings Panel */}
      {snapshot && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {t("Fixture Snapshot & Generation Audit")}
              </h3>
              <div className="text-xs text-slate-500 mt-0.5">
                {t("Random Seed:")} <span className="font-mono font-semibold text-slate-800">{snapshot.randomSeed}</span> · {t("Byes Awarded:")} <span className="font-semibold text-emerald-700">{snapshot.byeTeams.length}</span> · {t("Generated by {name}", { name: snapshot.generatedBy })}
              </div>
            </div>

        <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating || !canWrite}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md border border-slate-200 transition-colors disabled:opacity-50"
              >
                {isRegenerating ? t('Regenerating...') : t('Regenerate Draw')}
              </button>
              <button
                onClick={handlePublish}
                disabled={isPublishing || !canWrite}
                className="px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors disabled:opacity-50 shadow-sm"
              >
                {isPublishing ? t('Publishing...') : t('Lock & Publish')}
              </button>
            </div>
          </div>

          {/* Warnings (if any constraint had to be relaxed) */}
          {snapshot.warnings && snapshot.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5"><Icon name="triangleExclamation" size="sm" />{t("Applied Engine Constraint Warnings:")}</div>
              {snapshot.warnings.map((w, idx) => (
                <div key={idx} className="ml-2 font-mono text-[11px]">• {w}</div>
              ))}
            </div>
          )}

          {/* Applied rules checklist */}
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            {snapshot.appliedRules.map((rule, idx) => (
              <span key={idx} className="bg-slate-50 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                <Icon name="check" size="xs" className="mr-1 inline" />{rule}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Manual Swap Instruction Card */}
      {canWrite && (
        <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-lg text-xs text-indigo-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold shrink-0">{t("Manual Swap:")}</span>
            <span>
              {selectedTeamA
                ? t('1st team selected: "{name}". Click another team in Round 1 to swap.', { name: selectedTeamA.name })
                : t('Click any team in Round 1 to select for swap. The engine verifies all rules instantly.')}
            </span>
          </div>
          {selectedTeamA && (
            <button
              onClick={() => setSelectedTeamA(null)}
              className="text-xs text-indigo-700 underline font-medium"
            >
              {t("Cancel selection")}
            </button>
          )}
        </div>
      )}

      {/* Interactive Bracket */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <BracketView
          matches={matches}
          strongTeamIds={tournament.strongTeams}
          championTeamIds={championTeamIds}
          onSelectTeamForSwap={handleSelectTeamForSwap}
          selectedTeamForSwap={selectedTeamA}
          isInteractive={true}
          canWrite={canWrite}
        />
      </div>

      {/* Swap Confirmation Modal when rule violation is detected */}
      {swapWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-slate-200 max-h-full overflow-y-auto">
            <div className="flex items-center gap-2 text-amber-700 pb-2 border-b border-slate-100 mb-3">
              <Icon name="triangleExclamation" size="lg" className="text-red-text" />
              <h3 className="text-base font-bold text-slate-900">
                {t("Rule Violation Confirmation")}
              </h3>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              {t("Swapping {teamA} and {teamB} breaks the following fixture rules:", { teamA: swapWarningModal.teamA.name, teamB: swapWarningModal.teamB.name })}
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1 mb-4">
              {swapWarningModal.warnings.map((w, idx) => (
                <div key={idx} className="font-mono text-[11px]">• {w}</div>
              ))}
            </div>

            <p className="text-xs text-slate-500 mb-5">
              {t("Do you wish to override and apply this manual swap anyway? This action will be recorded in the tournament audit log.")}
            </p>

            <div className="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setSwapWarningModal(null)}
                className="px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md"
              >
                {t("Cancel Swap")}
              </button>
              <button
                onClick={() => triggerSwap(swapWarningModal.teamA, swapWarningModal.teamB, true)}
                disabled={isSwapping}
                className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors shadow-sm"
              >
                {isSwapping ? t('Applying...') : t('Confirm Override & Swap')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
