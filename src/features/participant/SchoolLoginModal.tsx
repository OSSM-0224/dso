import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext.tsx';
import { Building2, KeyRound, AlertCircle, X, ShieldCheck } from 'lucide-react';
import { QuickLoginDropdown } from '@/dev/temp-logins/QuickLoginDropdown.tsx'; // TEMP-LOGIN: remove later

interface SchoolLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SchoolLoginModal: React.FC<SchoolLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { loginAsSchool } = useAuth();
  const [loginMode, setLoginMode] = useState<'code' | 'email'>('code');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please provide your School Code / Email and Password.');
      return;
    }

    try {
      setError(null);
      setIsSubmitting(true);
      await loginAsSchool(identifier.trim(), password);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-800 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-xs">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Participant Portal Login</h2>
              <p className="text-xs text-indigo-100">District Sports Office · Navi Mumbai</p>
            </div>
          </div>
          <p className="text-xs text-indigo-200 mt-2 leading-relaxed">
            School coaches and team managers can access their exclusive match schedule, venue navigation, and notifications.
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to sign in</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex p-1 bg-slate-100 rounded-lg mb-5 text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => {
                setLoginMode('code');
                setError(null);
              }}
              className={`flex-1 py-1.5 rounded-md transition-all ${
                loginMode === 'code' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              School Code
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginMode('email');
                setError(null);
              }}
              className={`flex-1 py-1.5 rounded-md transition-all ${
                loginMode === 'email' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              Email or Phone
            </button>
          </div>

          {/* Quick Login Dropdown (Dev mode only) */}
          <QuickLoginDropdown
            portalType="school"
            onSelect={(id, pwd) => {
              setIdentifier(id);
              setPassword(pwd);
              setError(null);
            }}
          />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {loginMode === 'code' ? 'School Code' : 'Registered Email or Phone'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder={
                    loginMode === 'code' ? 'e.g. NHPS101 or MNR202' : 'coach@school.edu or 98200XXXXX'
                  }
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full pl-3.5 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all uppercase placeholder:normal-case font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {loginMode === 'code'
                  ? 'Your unique school identifier assigned by DSO organizers.'
                  : 'Email or phone number registered with DSO during enrollment.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-3.5 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold text-sm rounded-xl shadow-md hover:shadow-lg transition-all"
              >
                {isSubmitting ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Sign In to School Portal</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* DSO Security Badge */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Direct School Authorization
            </span>
            <span>Single-School Isolation</span>
          </div>
        </div>
      </div>
    </div>
  );
};
