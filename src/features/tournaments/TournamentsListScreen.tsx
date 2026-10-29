'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { api } from '@/lib/api.ts';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { TeamDoc, TournamentDoc } from '@/shared/types.ts';

interface TournamentsListScreenProps {
  onSelectTournament: (id: string) => void;
  canWrite: boolean;
}

export const TournamentsListScreen: React.FC<TournamentsListScreenProps> = ({
  onSelectTournament,
  canWrite,
}) => {
  const { t } = useI18n();
  const [tournaments, setTournaments] = useState<TournamentDoc[]>([]);
  const [allTeams, setAllTeams] = useState<TeamDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Tournament Form State
  const [name, setName] = useState('');
  const [sport, setSport] = useState('kho-kho');
  const [format, setFormat] = useState('single-elimination');
  const [ageGroup, setAgeGroup] = useState<'U-14' | 'U-17' | 'U-19'>('U-14');
  const [gender, setGender] = useState<'boys' | 'girls'>('boys');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [championLookbackYears, setChampionLookbackYears] = useState<number>(3);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [tList, teamList] = await Promise.all([
        api.tournaments.list(),
        api.teams.list(),
      ]);
      setTournaments(tList);
      setAllTeams(teamList);
    } catch (err: any) {
      setError(err.message || 'Failed to load tournaments');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const created = await api.tournaments.create({
        name: name.trim(),
        sport,
        format,
        ageGroup,
        gender,
        year: Number(year),
        championLookbackYears: Number(championLookbackYears),
        teams: selectedTeams,
      });

      setShowCreateModal(false);
      setName('');
      setSelectedTeams([]);
      await loadData();
      onSelectTournament(created.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create tournament');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTournament = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(t('Delete tournament "{name}"? This action cannot be undone.', { name }))) return;
    try {
      setError(null);
      await api.tournaments.delete(id);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete tournament');
    }
  };

  // Filter available teams matching current form ageGroup and gender
  const availableTeamsForForm = allTeams.filter(
    (t) => t.ageGroup === ageGroup && t.gender === gender
  );

  return (
    <div className="space-y-6">
      {/* Header Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {t("DSO District Tournaments & Fixtures")}
          </h2>
          <p className="text-xs text-slate-500 max-w-2xl mt-1">
            {t("Official single-elimination tournament management for District Sports Office Navi Mumbai. Generate mathematically balanced play-in brackets with automatic champion detection, strong team separation, and cross-medium school conflict prevention.")}
          </p>
        </div>

        {canWrite && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg transition-colors shadow-sm shrink-0 whitespace-nowrap"
          >
            {t("+ Create Tournament")}
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
          {t(error)}
        </div>
      )}

      {/* Tournaments Grid */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="inline-block animate-spin h-7 w-7 border-3 border-indigo-600 border-t-transparent rounded-full mb-2" />
          <div className="text-xs text-slate-500">{t("Loading tournaments...")}</div>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm space-y-3">
          <div className="text-3xl"><Icon name="trophy" size="xl" /></div>
          <h3 className="text-base font-bold text-slate-900">
            {t("No Tournaments Created Yet")}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {t("Get started by creating your first tournament or registering teams in Teams & Schools.")}
          </p>
          {canWrite && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-2 px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg shadow-sm hover:bg-indigo-700"
            >
              {t("+ Create Tournament")}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {tournaments.map((tournament) => (
            <div
              key={tournament.id}
              onClick={() => onSelectTournament(tournament.id)}
              className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-semibold text-indigo-700 uppercase">
                    {tournament.sport}
                  </span>
                  <span
                    className={`font-semibold capitalize px-2 py-0.5 rounded text-[10px] ${
                      tournament.status === 'completed'
                        ? 'bg-amber-100 text-amber-900'
                        : tournament.status === 'published'
                        ? 'bg-emerald-100 text-emerald-800'
                        : tournament.status === 'fixtures-generated'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {tournament.status.replace('-', ' ')}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 break-words">
                  {tournament.name}
                </h3>

                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <span>{tournament.ageGroup}</span>
                  <span>·</span>
                  <span className="capitalize">{tournament.gender}</span>
                  <span>·</span>
                  <span>{t("Year {year}", { year: tournament.year })}</span>
                </div>

                {tournament.winnerName && (
                  <div className="text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded p-2 flex items-center gap-1.5 font-medium">
                    <span className="inline-flex items-center gap-1.5"><Icon name="trophy" size="sm" />{t("Champion:")}</span>
                    <span className="truncate">{tournament.winnerName}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>{t("{count} Teams Enrolled", { count: tournament.teams.length })}</span>
                <div className="flex items-center gap-2">
                  {canWrite && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteTournament(e, tournament.id, tournament.name)}
                      className="text-red-600 hover:text-red-800 font-semibold"
                      title={t("Delete tournament")}
                    >
                      {t("Delete")}
                    </button>
                  )}
                  <span className="text-indigo-600 font-semibold">{t("Open Draw →")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Tournament Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <form
            onSubmit={handleCreateTournament}
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {t("Create New Tournament")}
              </h3>
              <button aria-label={t("Close")}
  type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                <Icon name="xmark" size="sm" align-middle />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t("Tournament Title")}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("e.g. Navi Mumbai DSO Kho-Kho Championship 2026")}
                className="w-full text-xs border border-slate-200 rounded-md p-2"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t("Sport")}
                </label>
                <select
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
                >
                  <option value="kho-kho">Kho-Kho</option>
                  <option value="kabaddi">{t("Kabaddi (Modular plug-in)")}</option>
                  <option value="volleyball">{t("Volleyball (Modular plug-in)")}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t("Format")}
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
                >
                  <option value="single-elimination">{t("Single Elimination (Play-In)")}</option>
                  <option value="round-robin">{t("Round Robin (Modular plug-in)")}</option>
                  <option value="groups-knockout">{t("Groups + Knockout (Modular)")}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t("Age Group")}
                </label>
                <select
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value as any)}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
                >
                  <option value="U-14">U-14</option>
                  <option value="U-17">U-17</option>
                  <option value="U-19">U-19</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t("Gender")}
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
                >
                  <option value="boys">{t("Boys")}</option>
                  <option value="girls">{t("Girls")}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t("Year")}
                </label>
                <input
                  type="number"
                  required
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t("Champion Lookback Years (Rule 1)")}
              </label>
              <select
                value={championLookbackYears}
                onChange={(e) => setChampionLookbackYears(Number(e.target.value))}
                className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
              >
                <option value={3}>{t("3 Years (Default - {start} to {end})", { start: year - 3, end: year - 1 })}</option>
                <option value={4}>{t("4 Years ({start} to {end})", { start: year - 4, end: year - 1 })}</option>
              </select>
              <span className="text-[10px] text-slate-400">
                {t("Number of previous years to scan for recent champions of the same sport + ageGroup + gender.")}
              </span>
            </div>

            {/* Team Selection */}
            <div>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  {t("Select Enrolled Teams ({count} selected)", { count: selectedTeams.length })}
                </label>
                {availableTeamsForForm.length > 0 && (
                  <button
  type="button"
                    onClick={() => {
                      if (selectedTeams.length === availableTeamsForForm.length) {
                        setSelectedTeams([]);
                      } else {
                        setSelectedTeams(availableTeamsForForm.map((team) => team.id));
                      }
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    {selectedTeams.length === availableTeamsForForm.length ? t("Deselect All") : t("Select All")}
                  </button>
                )}
              </div>

              {availableTeamsForForm.length === 0 ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-500 text-center">
                  {t("No {ageGroup} ({gender}) teams found. You can enroll teams now or add them later in Teams & Schools.", { ageGroup, gender })}
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 rounded-md p-2">
                  {availableTeamsForForm.map((team) => {
                    const isSelected = selectedTeams.includes(team.id);
                    return (
                      <div
                        key={team.id}
                        onClick={() =>
                          setSelectedTeams((prev) =>
                            prev.includes(team.id) ? prev.filter((id) => id !== team.id) : [...prev, team.id]
                          )
                        }
                        className={`p-2 rounded text-xs flex items-center justify-between cursor-pointer ${
                          isSelected ? 'bg-indigo-50 text-indigo-900 font-medium' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div>{team.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {team.schoolName} · {team.medium} {t("Medium")}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100">
              <button
  type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md"
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? t("Creating...") : t("Create Tournament")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
