'use client';

/**
 * Inline login gate for the standalone scoring console. Real staff accounts
 * (the seeded SCORER / SCORER2 temp logins in dev) sign in against the staff
 * cookie — role previews stay on the admin surface.
 */
import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext.tsx';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { QuickLoginDropdown } from '@/dev/temp-logins/QuickLoginDropdown.tsx';

export const ScorerLoginCard: React.FC<{ onSignedIn?: () => void }> = ({ onSignedIn }) => {
  const { t } = useI18n();
  const { loginStaff } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent, overrideIdentifier?: string) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await loginStaff(overrideIdentifier ?? identifier, password);
      onSignedIn?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-5 shadow-raise">
      <div className="mb-4 flex items-center gap-2">
        <Icon name="bolt" size="md" className="text-accent-strong" />
        <div>
          <h2 className="font-serif text-[16px] font-semibold text-ink">{t("Scorer sign in")}</h2>
          <p className="text-[11px] text-muted">
            {t("Enter your scorer account credentials to record live events.")}
          </p>
        </div>
      </div>

      <form onSubmit={(e) => submit(e)} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">
            {t("Email or code")}
          </span>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            className="w-full rounded-[6px] border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-accent-strong focus:outline-none"
            placeholder="scorer@dso.gov.in"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">
            {t("Password")}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-[6px] border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-accent-strong focus:outline-none"
            placeholder={t("Password")}
          />
        </label>

        {error && (
          <p className="flex items-center gap-1.5 rounded-[6px] bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            <Icon name="circleAlert" size="sm" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !identifier || !password}
          className="flex w-full items-center justify-center gap-2 rounded-[6px] bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {busy ? <Icon name="spinner" size="sm" spin /> : <Icon name="rightToBracket" size="sm" />}
          Sign in
        </button>
      </form>

      <QuickLoginDropdown
        portalType="scorer"
        onSelect={(identifierPick) => {
          setIdentifier(identifierPick);
          setPassword('DSO@2026');
        }}
      />
    </div>
  );
};
