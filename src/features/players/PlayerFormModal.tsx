"use client";
import React, { useState, useEffect } from "react";
import { Icon } from "@/components/ui/Icon.tsx";
import { api } from "@/lib/api.ts";
import { useI18n } from "@/i18n/LanguageProvider.tsx";
import { PlayerDoc, TeamDoc, SchoolDoc, TournamentDoc, UserSession } from "@/shared/types.ts";

interface PlayerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingPlayer: PlayerDoc | null;
  canWrite: boolean;
  user: UserSession;
  schools: SchoolDoc[];
  teams: TeamDoc[];
  tournaments: TournamentDoc[];
}

export const PlayerFormModal: React.FC<PlayerFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingPlayer,
  canWrite,
  user,
  schools,
  teams,
  tournaments,
}) => {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    jerseyNumber: '',
    schoolId: user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer'
      ? user.schoolId || ''
      : '',
    teamId: '',
    gender: '' as '' | 'boys' | 'girls',
    ageGroup: '',
    dateOfBirth: '',
    isActive: true,
  });

  const isEditMode = !!editingPlayer;

  useEffect(() => {
    if (editingPlayer) {
      setFormData({
        name: editingPlayer.name || '',
        jerseyNumber: editingPlayer.jerseyNumber?.toString() || '',
        schoolId: editingPlayer.schoolId || '',
        teamId: editingPlayer.teamId || '',
        gender: editingPlayer.gender || '',
        ageGroup: editingPlayer.ageGroup || '',
        dateOfBirth: editingPlayer.dateOfBirth || '',
        isActive: editingPlayer.isActive !== false,
      });
    } else {
      setFormData({
        name: '',
        jerseyNumber: '',
        schoolId: user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer'
          ? user.schoolId || ''
          : '',
        teamId: '',
        gender: '',
        ageGroup: '',
        dateOfBirth: '',
        isActive: true,
      });
    }
    setError(null);
  }, [editingPlayer, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError(t('Player name is required'));
      return;
    }

    if (!formData.schoolId) {
      setError(t('School is required'));
      return;
    }

    if (!formData.teamId) {
      setError(t('Team is required'));
      return;
    }

    if (formData.jerseyNumber && isNaN(parseInt(formData.jerseyNumber))) {
      setError(t('Jersey number must be a valid number'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const playerData = {
        name: formData.name.trim(),
        jerseyNumber: formData.jerseyNumber ? parseInt(formData.jerseyNumber) : undefined,
        schoolId: formData.schoolId,
        teamId: formData.teamId,
        gender: formData.gender || undefined,
        ageGroup: formData.ageGroup || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        isActive: formData.isActive,
      };

      if (isEditMode) {
        await api.players.update(editingPlayer!.id, playerData);
      } else {
        await api.players.create(playerData);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || t('Failed to save player'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    setFormData({
      name: '',
      jerseyNumber: '',
      schoolId: user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer'
        ? user.schoolId || ''
        : '',
      teamId: '',
      gender: '',
      ageGroup: '',
      dateOfBirth: '',
      isActive: true,
    });
    setError(null);
  };

  const getSchoolName = (schoolId: string) => {
    const school = schools.find(s => s.id === schoolId);
    return school ? school.name : '';
  };

  const getFilteredTeams = () => {
    if (user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer') {
      return teams.filter(t => t.schoolId === user.schoolId);
    }
    if (formData.schoolId) {
      return teams.filter(t => t.schoolId === formData.schoolId);
    }
    return teams;
  };

  const availableTeams = getFilteredTeams();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 sm:p-8 border border-slate-200 space-y-6 max-h-full overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">
            {isEditMode ? t('Edit Player') : t('Add New Player')}
          </h3>
          <button
            aria-label={t('Close')}
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
            disabled={isLoading}
          >
            <Icon name="xmark" size="sm" align-middle />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
            {t(error)}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('Full Name')} <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('e.g. John Doe')}
              className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('Jersey Number')}
            </label>
            <input
              type="number"
              min="1"
              value={formData.jerseyNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, jerseyNumber: e.target.value }))}
              placeholder={t('e.g. 10')}
              className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isLoading}
            />
          </div>

          {(user.role === 'admin' || user.role === 'organizer') && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('School')} <span className="text-red-600">*</span>
              </label>
              <select
                required
                value={formData.schoolId}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, schoolId: e.target.value, teamId: '' }));
                }}
                className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isLoading}
              >
                <option value="">{t('Select School')}</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(user.role === 'admin' || user.role === 'organizer') && formData.schoolId && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('Team')} <span className="text-red-600">*</span>
              </label>
              <select
                required
                value={formData.teamId}
                onChange={(e) => setFormData(prev => ({ ...prev, teamId: e.target.value }))}
                className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isLoading}
              >
                <option value="">{t('Select Team')}</option>
                {availableTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({getSchoolName(team.schoolId)})
                  </option>
                ))}
              </select>
              {availableTeams.length === 0 && formData.schoolId && (
                <p className="text-xs text-amber-600 mt-1">
                  {t('No teams found for the selected school')}
                </p>
              )}
            </div>
          )}

          {(user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer') && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('School')}
              </label>
              <input
                type="text"
                value={schools.find(s => s.id === user.schoolId)?.name || ''}
                disabled
                className="w-full text-xs border border-slate-200 rounded-md p-2 bg-slate-50 text-slate-500"
              />
            </div>
          )}

          {(user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer') && teams.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('Team')} <span className="text-red-600">*</span>
              </label>
              <select
                required
                value={formData.teamId}
                onChange={(e) => setFormData(prev => ({ ...prev, teamId: e.target.value }))}
                className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isLoading}
              >
                <option value="">{t('Select Team')}</option>
                {teams.filter(t => t.schoolId === user.schoolId).map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('Gender')}
            </label>
            <select
              value={formData.gender}
              onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value as '' | 'boys' | 'girls' }))}
              className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isLoading}
            >
              <option value="">{t('Select Gender')}</option>
              <option value="boys">{t('Boys')}</option>
              <option value="girls">{t('Girls')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('Age Group')}
            </label>
            <select
              value={formData.ageGroup}
              onChange={(e) => setFormData(prev => ({ ...prev, ageGroup: e.target.value }))}
              className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isLoading}
            >
              <option value="">{t('Select Age Group')}</option>
              <option value="U-14">U-14</option>
              <option value="U-17">U-17</option>
              <option value="U-19">U-19</option>
              <option value="Open">Open</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('Date of Birth')}
            </label>
            <input
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
              className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
              disabled={isLoading}
            />
            <label htmlFor="isActive" className="ml-2 text-xs font-medium text-slate-700">
              {t('Active Player')}
            </label>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md"
            disabled={isLoading}
          >
            {t('Cancel')}
          </button>
          <button
            type="submit"
            className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            {isLoading
              ? t('Saving...')
              : isEditMode
                ? t('Save Changes')
                : t('Create Player')
            }
          </button>
        </div>
      </form>
    </div>
  );
};
