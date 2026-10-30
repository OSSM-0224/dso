"use client";
import React, { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon.tsx";
import { api } from "@/lib/api.ts";
import { useI18n } from "@/i18n/LanguageProvider.tsx";
import { PlayerDoc, TeamDoc, UserSession } from "@/shared/types.ts";

interface PlayerFormModalProps {
  isOpen: boolean;
  /** Admin/organizer school choices; empty indicates "any school". */
  schoolOptions?: Array<{ id: string; name: string }>;
  /** Teams available to pick from, already filtered server-side / client-side. */
  teams: TeamDoc[];
  user: UserSession;
  editingPlayer: PlayerDoc | null;
  onClose: () => void;
  onSuccess: (savedPlayer: PlayerDoc) => void;
}

const AGE_GROUPS = ["U-14", "U-17", "U-19", "Open"] as const;

export const PlayerFormModal: React.FC<PlayerFormModalProps> = ({
  isOpen,
  schoolOptions = [],
  teams,
  user,
  editingPlayer,
  onClose,
  onSuccess,
}) => {
  const { t } = useI18n();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isParticipant =
    user?.role === "participant" && Boolean(user?.schoolId);

  const [form, setForm] = useState({
    name: "",
    jerseyNumber: "",
    schoolId: "",
    teamId: "",
    gender: "" as "" | "boys" | "girls",
    ageGroup: "",
    dateOfBirth: "",
    isActive: true,
  });

  useEffect(() => {
    if (!isOpen) return;
    if (editingPlayer) {
      setForm({
        name: editingPlayer.name || "",
        jerseyNumber:
          editingPlayer.jerseyNumber !== undefined
            ? String(editingPlayer.jerseyNumber)
            : "",
        schoolId: editingPlayer.schoolId || "",
        teamId: editingPlayer.teamId || "",
        gender: editingPlayer.gender || "",
        ageGroup: editingPlayer.ageGroup || "",
        dateOfBirth: editingPlayer.dateOfBirth || "",
        isActive: editingPlayer.isActive !== false,
      });
    } else {
      setForm({
        name: "",
        jerseyNumber: "",
        schoolId: isParticipant ? user.schoolId || "" : "",
        teamId: "",
        gender: "",
        ageGroup: "",
        dateOfBirth: "",
        isActive: true,
      });
    }
    setError(null);
  }, [isOpen, editingPlayer]);

  const isEditMode = Boolean(editingPlayer);

  // Teams selectable in the form: filter by the chosen school (admin) — for
  // participants the caller already passes only their school's teams.
  const availableTeams = isParticipant
    ? teams
    : teams.filter((team) => !form.schoolId || team.schoolId === form.schoolId);

  // The form keeps the team's own age group / gender as the defaults; the
  // server also derives them from the team when omitted.
  const validate = (): string | null => {
    if (!form.name.trim() || form.name.trim().length < 2)
      return t("Player name must have at least 2 characters");
    if (!form.teamId) return t("Team is required");
    if (!isParticipant && !form.schoolId) return t("School is required");
    if (form.jerseyNumber.trim()) {
      const n = Number(form.jerseyNumber);
      if (!Number.isInteger(n) || n <= 0)
        return t("Jersey number must be a positive integer");
    }
    if (form.dateOfBirth) {
      const dob = new Date(form.dateOfBirth);
      if (Number.isNaN(dob.getTime())) return t("Invalid date of birth");
      if (dob.getTime() > Date.now())
        return t("Date of birth cannot be in the future");
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setIsSaving(true);
    setError(null);

    // NOTE: The backend schema is `.strict()` and derives schoolId, ageGroup
    // and gender server-side from the team — never send derived fields.
    const payload = {
      teamId: form.teamId,
      name: form.name.trim(),
      ...(form.jerseyNumber.trim()
        ? { jerseyNumber: Number(form.jerseyNumber) }
        : { jerseyNumber: undefined }),
      ...(form.ageGroup ? { ageGroup: form.ageGroup } : {}),
      ...(form.gender ? { gender: form.gender } : {}),
      ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : { dateOfBirth: undefined }),
      isActive: form.isActive,
    };

    try {
      const saved = isEditMode
        ? await api.players.update(editingPlayer!.id, payload)
        : await api.players.create(payload);
      onSuccess(saved);
    } catch (err: any) {
      setError(err?.message || t("Failed to save player"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenSchoolChange = (schoolId: string) => {
    // Changing school resets team choice because teams are school-bound.
    setForm((prev) => ({ ...prev, schoolId, teamId: "" }));
  };

  if (!isOpen) return null;

  const inputCls =
    "w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const labelCls = "block text-xs font-semibold text-slate-700 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-full overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">
            {isEditMode ? t("Edit Player") : t("Add Player")}
          </h3>
          <button
            aria-label={t("Close")}
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
          >
            <Icon name="xmark" size="sm" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
            {t(error)}
          </div>
        )}

        <div className="space-y-4">
          {/* School: admin/organizer pick from all schools; participants see a fixed value */}
          {isParticipant ? (
            <div>
              <label className={labelCls}>{t("School")}</label>
              <input
                type="text"
                value={user.schoolName || ""}
                readOnly
                disabled
                className="w-full text-xs border border-slate-200 rounded-md p-2 bg-slate-50 text-slate-500"
              />
            </div>
          ) : (
            <div>
              <label className={labelCls}>
                {t("School")} <span className="text-red-600">*</span>
              </label>
              <select
                required
                value={form.schoolId}
                onChange={(e) => handleOpenSchoolChange(e.target.value)}
                className={inputCls}
                disabled={isSaving}
              >
                <option value="">{t("Select School")}</option>
                {schoolOptions.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>
              {t("Team")} <span className="text-red-600">*</span>
            </label>
            <select
              required
              value={form.teamId}
              onChange={(e) => setForm((prev) => ({ ...prev, teamId: e.target.value }))}
              className={inputCls}
              disabled={isSaving || (!isParticipant && !form.schoolId)}
            >
              <option value="">{t("Select Team")}</option>
              {availableTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} · {team.ageGroup} {team.gender === "boys" ? t("Boys") : t("Girls")} · {team.medium}
                </option>
              ))}
            </select>
            {!isParticipant && !form.schoolId && (
              <span className="text-[10px] text-slate-400">
                {t("Choose a school first to list its teams.")}
              </span>
            )}
            {availableTeams.length === 0 && (isParticipant || form.schoolId) && (
              <span className="text-[10px] text-amber-600">
                {t("No teams available for this school yet.")}
              </span>
            )}
          </div>

          <div>
            <label className={labelCls}>
              {t("Full Name")} <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t("Player full name")}
              className={inputCls}
              disabled={isSaving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("Jersey Number")}</label>
              <input
                type="number"
                min={1}
                value={form.jerseyNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, jerseyNumber: e.target.value }))}
                placeholder={t("e.g. 7")}
                className={inputCls}
                disabled={isSaving}
              />
            </div>
            <div>
              <label className={labelCls}>{t("Date of Birth")}</label>
              <input
                type="date"
                value={form.dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                className={inputCls}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("Gender")}</label>
              <select
                value={form.gender}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, gender: e.target.value as "" | "boys" | "girls" }))
                }
                className={inputCls}
                disabled={isSaving}
              >
                <option value="">{t("From team")}</option>
                <option value="boys">{t("Boys")}</option>
                <option value="girls">{t("Girls")}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("Age Group")}</label>
              <select
                value={form.ageGroup}
                onChange={(e) => setForm((prev) => ({ ...prev, ageGroup: e.target.value }))}
                className={inputCls}
                disabled={isSaving}
              >
                <option value="">{t("From team")}</option>
                {AGE_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="w-4 h-4 accent-indigo-600"
              disabled={isSaving}
            />
            <span className="text-xs font-medium text-slate-700">{t("Active")}</span>
          </label>
        </div>

        <div className="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md"
          >
            {t("Cancel")}
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving
              ? t("Saving...")
              : isEditMode
                ? t("Save Changes")
                : t("Create Player")}
          </button>
        </div>
      </form>
    </div>
  );
};
