import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { useAuth } from '@/context/AuthContext.tsx';

export const ForcePasswordChangeModal: React.FC = () => {
  const { user, mustChangePassword, changePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!mustChangePassword || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    try {
      setError(null);
      setIsSubmitting(true);
      await changePassword(newPassword);
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-amber-200 overflow-hidden animate-in fade-in zoom-in-95">
        {/* Banner */}
        <div className="bg-amber-500 text-slate-950 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-600/30 rounded-xl">
              <Icon name="shieldAlert" size="xl" className="text-slate-950" />
            </div>
            <div>
              <h2 className="text-lg font-bold">First Login Security Update</h2>
              <p className="text-xs text-amber-950 font-medium">District Sports Office Requirement</p>
            </div>
          </div>
          <p className="text-xs text-slate-900 mt-2 font-medium">
            Welcome, <span className="font-bold">{user.schoolName || user.name}</span>. For the security of your school's team roster and match communications, please set a permanent password before continuing.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              New Permanent Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={6}
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-3.5 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={6}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-3.5 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-sm rounded-xl shadow-md transition-all"
            >
              {isSubmitting ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Icon name="lock" size="md" />
                  <span>Update Password & Enter Portal</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 justify-center pt-2">
            <Icon name="circleCheck" size="sm" className="text-emerald-600" />
            <span>Encrypted with PBKDF2 high-grade key derivation</span>
          </div>
        </form>
      </div>
    </div>
  );
};
