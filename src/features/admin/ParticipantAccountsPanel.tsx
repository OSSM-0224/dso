import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { api } from '@/lib/api.ts';
import { SchoolDoc } from '@/shared/types.ts';

interface ParticipantAccountsPanelProps {
  schools: SchoolDoc[];
  onAccountCreated?: () => void;
  onViewAsSchool?: (account: any) => void;
}

export const ParticipantAccountsPanel: React.FC<ParticipantAccountsPanelProps> = ({
  schools,
  onAccountCreated,
  onViewAsSchool,
}) => {
  const [participants, setParticipants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [customSchoolCode, setCustomSchoolCode] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('DSO@' + Math.floor(1000 + Math.random() * 9000));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset Password Modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<any | null>(null);
  const [newTempPassword, setNewTempPassword] = useState('');

  // Copied indicator
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadParticipants();
  }, []);

  const loadParticipants = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const list = await api.admin.participants.list();
      setParticipants(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load participant accounts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreate = (prefillSchoolId?: string) => {
    setError(null);
    setSuccessMsg(null);
    setSelectedSchoolId(prefillSchoolId || (schools.length > 0 ? schools[0].id : ''));
    setContactName('');
    setEmail('');
    setPhone('');
    setCustomSchoolCode('');
    setTemporaryPassword('DSO@' + Math.floor(1000 + Math.random() * 9000));
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolId || !contactName.trim() || !temporaryPassword) {
      setError('Please fill in School, Contact Name, and Temporary Password.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await api.admin.participants.create({
        schoolId: selectedSchoolId,
        name: contactName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        schoolCode: customSchoolCode.trim().toUpperCase() || undefined,
        temporaryPassword,
      });

      setSuccessMsg(
        `Account created successfully for "${res.schoolName}". School Code: ${res.schoolCode}, Temporary Password: ${temporaryPassword}`
      );
      setShowCreateModal(false);
      await loadParticipants();
      if (onAccountCreated) onAccountCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create participant account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser || !newTempPassword) return;

    try {
      setIsSubmitting(true);
      setError(null);
      await api.admin.participants.resetPassword(resetTargetUser.id, newTempPassword);
      setSuccessMsg(
        `Password reset for "${resetTargetUser.schoolName}". New temporary password: ${newTempPassword}`
      );
      setShowResetModal(false);
      setResetTargetUser(null);
      await loadParticipants();
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: any) => {
    try {
      setError(null);
      await api.admin.participants.toggleStatus(user.id, !user.isActive);
      setSuccessMsg(`Account for "${user.schoolName}" is now ${!user.isActive ? 'Active' : 'Deactivated'}.`);
      await loadParticipants();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle account status');
    }
  };

  const handleCopyInvite = (user: any) => {
    const inviteText = `District Sports Office (DSO) Navi Mumbai - School Portal Access\nSchool: ${user.schoolName}\nSchool Code: ${user.schoolCode || 'N/A'}\nTemporary Password: (As provided during account setup or reset)\nPortal Link: ${window.location.origin}`;
    navigator.clipboard.writeText(inviteText);
    setCopiedId(user.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Filter accounts
  const filteredParticipants = participants.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.schoolName.toLowerCase().includes(q) ||
      (p.schoolCode && p.schoolCode.toLowerCase().includes(q)) ||
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q))
    );
  });

  // Calculate schools without an account
  const accountedSchoolIds = new Set(participants.map((p) => p.schoolId));
  const unconfiguredSchools = schools.filter((s) => !accountedSchoolIds.has(s.id));

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Icon name="shieldCheck" size="lg" className="text-indigo-600" />
            <span>Participant School Accounts</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage school coach credentials, invite links, and track schedule acknowledgements.
          </p>
        </div>

        <button
          onClick={() => handleOpenCreate()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0"
        >
          <Icon name="userPlus" size="md" />
          <span>Create School Account</span>
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
          <Icon name="circleAlert" size="md" className="shrink-0 text-red-600 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
          <Icon name="check" size="md" className="shrink-0 text-emerald-600 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Unconfigured Schools Quick Alert */}
      {unconfiguredSchools.length > 0 && (
        <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="font-bold">{unconfiguredSchools.length} Schools</span> have not been issued login credentials yet.
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-800 text-[11px]">Unregistered: {unconfiguredSchools.slice(0, 3).map((s) => s.name).join(', ')}{unconfiguredSchools.length > 3 ? ` +${unconfiguredSchools.length - 3} more` : ''}</span>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Icon name="search" size="md" className="text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Search by school name, school code, or coach name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Accounts Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-3">School & Code</th>
                <th className="py-3 px-3">Representative</th>
                <th className="py-3 px-3">Account Status</th>
                <th className="py-3 px-3">Password State</th>
                <th className="py-3 px-3">Last Login</th>
                <th className="py-3 px-3 text-center">Acknowledgements</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredParticipants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No participant accounts found. Click "Create School Account" to issue logins.
                  </td>
                </tr>
              ) : (
                filteredParticipants.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <Icon name="school" size="md" className="text-slate-400 shrink-0" />
                        <div>
                          <p className="font-bold text-slate-900">{p.schoolName}</p>
                          <span className="font-mono text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                            {p.schoolCode || 'No Code'}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-slate-700">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-[11px] text-slate-400">{p.email || p.phone || 'No direct contact'}</p>
                    </td>

                    <td className="py-3.5 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.isActive
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {p.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>

                    <td className="py-3.5 px-3">
                      {p.mustChangePassword ? (
                        <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          Pending First Change
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-emerald-700">
                          Password Active
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-3 text-slate-500 text-[11px]">
                      {p.lastLoginAt ? new Date(p.lastLoginAt).toLocaleString() : 'Never logged in'}
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                        <Icon name="calendarCheck" size="sm" className="text-indigo-600" />
                        <span>{p.acknowledgementCount} matches</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                      {onViewAsSchool && (
                        <button
                          onClick={() => onViewAsSchool(p)}
                          className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors"
                          title="View as School (Read-Only Preview)"
                        >
                          <Icon name="eye" size="sm" />
                        </button>
                      )}

                      <button
                        onClick={() => handleCopyInvite(p)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                        title="Copy School Credentials & Portal Link"
                      >
                        {copiedId === p.id ? (
                          <Icon name="check" size="sm" className="text-emerald-600" />
                        ) : (
                          <Icon name="copy" size="sm" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setResetTargetUser(p);
                          setNewTempPassword('DSO@' + Math.floor(1000 + Math.random() * 9000));
                          setShowResetModal(true);
                        }}
                        className="p-1.5 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 rounded-lg transition-colors"
                        title="Reset Temporary Password"
                      >
                        <Icon name="rotate" size="sm" />
                      </button>

                      <button
                        onClick={() => handleToggleStatus(p)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          p.isActive
                            ? 'bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700'
                            : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        }`}
                        title={p.isActive ? 'Deactivate Account' : 'Reactivate Account'}
                      >
                        <Icon name="power" size="sm" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-full">
            <div className="bg-indigo-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="userPlus" size="lg" />
                <h3 className="text-base font-bold">Issue School Participant Login</h3>
              </div>
              <button aria-label="Close"
                onClick={() => setShowCreateModal(false)}
                className="text-white/80 hover:text-white"
              >
                <Icon name="xmark" size="sm" align-middle />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select School *
                </label>
                <select
                  required
                  value={selectedSchoolId}
                  onChange={(e) => setSelectedSchoolId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Choose School --</option>
                  {schools.map((s) => {
                    const alreadyHas = accountedSchoolIds.has(s.id);
                    return (
                      <option key={s.id} value={s.id} disabled={alreadyHas}>
                        {s.name} {alreadyHas ? '(Account exists)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Coach / Representative Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Coach Ramesh Patil"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="coach@school.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone / Mobile
                  </label>
                  <input
                    type="tel"
                    placeholder="98200XXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    School Code (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-generated if blank"
                    value={customSchoolCode}
                    onChange={(e) => setCustomSchoolCode(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Temporary Password *
                  </label>
                  <input
                    type="text"
                    required
                    value={temporaryPassword}
                    onChange={(e) => setTemporaryPassword(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                School coaches will be prompted to set a permanent password immediately upon their first login.
              </p>

              <div className="pt-3 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  {isSubmitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {showResetModal && resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-full">
            <div className="bg-amber-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="rotate" size="lg" />
                <h3 className="text-base font-bold">Reset School Password</h3>
              </div>
              <button aria-label="Close"
                onClick={() => setShowResetModal(false)}
                className="text-white/80 hover:text-white"
              >
                <Icon name="xmark" size="sm" align-middle />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Generate a new temporary password for{' '}
                <span className="font-bold text-slate-900">{resetTargetUser.schoolName}</span>. The coach will be required to change it on next login.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Temporary Password
                </label>
                <input
                  type="text"
                  required
                  value={newTempPassword}
                  onChange={(e) => setNewTempPassword(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  {isSubmitting ? 'Resetting...' : 'Confirm Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
