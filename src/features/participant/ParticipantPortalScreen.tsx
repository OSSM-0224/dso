import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { api } from '@/lib/api.ts';
import { useAuth } from '@/context/AuthContext.tsx';
import { MatchDetailModal } from './MatchDetailModal.tsx';

interface ParticipantPortalScreenProps {
  onOpenPublicBracket?: (tournamentId: string) => void;
  /** Deep-link support for the /school/* Next.js routes (default 'dashboard'). */
  initialTab?: 'dashboard' | 'schedule' | 'bracket' | 'notifications';
  /** Auto-open the detail modal for this match id (used by /school/matches/[id]). */
  openMatchId?: string | null;
}

export const ParticipantPortalScreen: React.FC<ParticipantPortalScreenProps> = ({
  onOpenPublicBracket,
  initialTab = 'dashboard',
  openMatchId = null,
}) => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'schedule' | 'bracket' | 'notifications'>(initialTab);

  // Dashboard Data
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState<number>(0);
  const [bracketPathData, setBracketPathData] = useState<any | null>(null);

  // Filters for Schedule
  const [selectedTournamentFilter, setSelectedTournamentFilter] = useState<string>('all');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('all');
  const [scheduleDateFilter, setScheduleDateFilter] = useState<'all' | 'today' | 'upcoming' | 'past'>('all');

  // Selected tournament for Bracket Path
  const [selectedBracketTournamentId, setSelectedBracketTournamentId] = useState<string>('');

  // Selected match for Detail Modal
  const [selectedMatchData, setSelectedMatchData] = useState<any | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live countdown state for Next Match
  const [countdownText, setCountdownText] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isPast: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: false });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [dash, matchList, notifData] = await Promise.all([
        api.my.getDashboard(),
        api.my.getMatches(),
        api.my.getNotifications(),
      ]);

      setDashboardData(dash);
      setMatches(matchList);
      setNotifications(notifData.notifications);
      setUnreadNotifsCount(notifData.unreadCount);

      if (dash.tournaments && dash.tournaments.length > 0 && !selectedBracketTournamentId) {
        setSelectedBracketTournamentId(dash.tournaments[0].id);
        loadBracketPath(dash.tournaments[0].id);
      }

      if (openMatchId) {
        const linked = matchList.find((m: any) => m.id === openMatchId) || null;
        if (linked) setSelectedMatchData(linked);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load school portal data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadBracketPath = async (tourneyId: string) => {
    try {
      const data = await api.my.getBracketPath(tourneyId);
      setBracketPathData(data);
    } catch (err: any) {
      console.warn('Failed to load bracket path:', err.message);
    }
  };

  // Countdown timer effect for Next Match
  useEffect(() => {
    if (!dashboardData?.nextMatch?.match?.scheduledAt) return;

    const targetTime = new Date(dashboardData.nextMatch.match.scheduledAt).getTime();

    const updateCountdown = () => {
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setCountdownText({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setCountdownText({ days, hours, minutes, seconds, isPast: false });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [dashboardData?.nextMatch]);

  const handleAcknowledge = async (matchId: string) => {
    try {
      await api.my.acknowledgeMatch(matchId);
      // Refresh matches and dashboard
      loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to acknowledge match');
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await api.my.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadNotifsCount((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.my.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadNotifsCount(0);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Schedule filtering logic
  const filteredMatches = matches.filter((m) => {
    if (selectedTournamentFilter !== 'all' && m.tournament.id !== selectedTournamentFilter) {
      return false;
    }
    if (selectedTeamFilter !== 'all' && m.myTeam?.id !== selectedTeamFilter) {
      return false;
    }
    if (scheduleDateFilter === 'today') {
      if (!m.scheduledAt) return false;
      const matchDate = new Date(m.scheduledAt).toDateString();
      const today = new Date().toDateString();
      return matchDate === today;
    }
    if (scheduleDateFilter === 'upcoming') {
      return m.status !== 'completed';
    }
    if (scheduleDateFilter === 'past') {
      return m.status === 'completed';
    }
    return true;
  });

  if (isLoading && !dashboardData) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-8 text-center">
        <Icon name="refresh" size="xl" className="text-indigo-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-700">Loading your school portal...</p>
        <p className="text-xs text-slate-400 mt-1">Fetching authorized match schedule and notifications</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-6 bg-white border border-red-200 rounded-2xl shadow-sm text-center">
        <Icon name="circleAlert" size="md" className="text-red-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900">Access Error</h3>
        <p className="text-xs text-slate-600 mt-1">{error}</p>
        <button
          onClick={loadAllData}
          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg"
        >
          Try Again
        </button>
      </div>
    );
  }

  const school = dashboardData?.school;
  const stats = dashboardData?.stats;
  const nextMatch = dashboardData?.nextMatch;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Mobile-First School Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/20 to-transparent pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
              <Icon name="school" size="xl" className="text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/20">
                  School Code: {school?.schoolCode || 'DSO-PART'}
                </span>
                <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active Portal
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                {school?.name}
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                Representing {stats?.totalTeams || 0} teams across {school?.mediums?.join(', ')} mediums
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
            <button
              onClick={() => setActiveTab('notifications')}
              className="relative p-2 rounded-xl bg-white/10 hover:bg-white/15 transition-colors"
              title="Notifications"
            >
              <Icon name="bell" size="lg" className="text-indigo-200" />
              {unreadNotifsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                  {unreadNotifsCount}
                </span>
              )}
            </button>

            <button
              onClick={signOut}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-200 transition-colors"
            >
              <Icon name="rightFromBracket" size="sm" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 mt-6 pt-4 border-t border-white/10 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'schedule'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            My Schedule ({matches.length})
          </button>
          <button
            onClick={() => setActiveTab('bracket')}
            className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'bracket'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            My Bracket Path
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'notifications'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>Notifications</span>
            {unreadNotifsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px]">
                {unreadNotifsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Highlight Next Match Card */}
          {nextMatch ? (
            <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-800 rounded-2xl p-5 sm:p-6 text-white shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/20 text-white backdrop-blur-xs">
                      NEXT MATCH
                    </span>
                    <span className="text-xs text-indigo-200">
                      {nextMatch.tournament?.name} · {nextMatch.match?.roundName}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                      {nextMatch.myTeam?.name} <span className="text-indigo-200 text-base font-normal">vs</span>{' '}
                      {nextMatch.opponentDisplay?.label}
                    </h2>
                    <p className="text-xs text-indigo-200">
                      {nextMatch.opponentDisplay?.dependencyText ||
                        (nextMatch.opponentDisplay?.isDecided
                          ? `Against ${nextMatch.opponentDisplay?.schoolName}`
                          : 'Awaiting earlier round winner')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-indigo-100 pt-1">
                    <span className="flex items-center gap-1.5">
                      <Icon name="calendar" size="md" className="text-indigo-300" />
                      {nextMatch.match?.scheduledAt
                        ? new Date(nextMatch.match.scheduledAt).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'Date TBD'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Icon name="clock" size="md" className="text-indigo-300" />
                      {nextMatch.match?.scheduledAt
                        ? new Date(nextMatch.match.scheduledAt).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Time TBD'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Icon name="location" size="md" className="text-indigo-300" />
                      {nextMatch.match?.venue || 'DSO Sports Complex'}
                    </span>
                  </div>
                </div>

                {/* Countdown Block */}
                <div className="bg-black/20 rounded-xl p-4 backdrop-blur-xs flex flex-col items-center justify-center min-w-[220px] text-center border border-white/10">
                  <span className="text-[11px] font-semibold text-indigo-200 uppercase tracking-wider mb-2">
                    {countdownText.isPast ? 'Match Time' : 'Kick-Off Countdown'}
                  </span>
                  {countdownText.isPast ? (
                    <span className="text-sm font-bold text-emerald-300">Match in progress or scheduled</span>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-white/10 rounded-lg p-2 min-w-[42px]">
                        <span className="text-lg font-black block">{countdownText.days}</span>
                        <span className="text-[9px] text-indigo-200 uppercase">Days</span>
                      </div>
                      <div className="bg-white/10 rounded-lg p-2 min-w-[42px]">
                        <span className="text-lg font-black block">{countdownText.hours}</span>
                        <span className="text-[9px] text-indigo-200 uppercase">Hrs</span>
                      </div>
                      <div className="bg-white/10 rounded-lg p-2 min-w-[42px]">
                        <span className="text-lg font-black block">{countdownText.minutes}</span>
                        <span className="text-[9px] text-indigo-200 uppercase">Min</span>
                      </div>
                      <div className="bg-white/10 rounded-lg p-2 min-w-[42px]">
                        <span className="text-lg font-black block">{countdownText.seconds}</span>
                        <span className="text-[9px] text-indigo-200 uppercase">Sec</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-4 w-full">
                    <button
                      onClick={() => setSelectedMatchData(nextMatch)}
                      className="flex-1 py-1.5 bg-white text-indigo-900 text-xs font-bold rounded-lg hover:bg-indigo-50 transition-colors shadow-xs"
                    >
                      Match Details
                    </button>
                    {!nextMatch.isAcknowledged && (
                      <button
                        onClick={() => handleAcknowledge(nextMatch.match.id)}
                        className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors"
                        title="Acknowledge schedule"
                      >
                        Confirm
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center shadow-xs">
              <Icon name="calendar" size="md" className="text-slate-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-800">No Upcoming Matches Scheduled</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {stats?.activeTournamentsCount === 0
                  ? 'Fixtures not published yet. You will be notified as soon as DSO releases the official bracket.'
                  : 'Your teams currently have no pending upcoming matches.'}
              </p>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Matches Played</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{stats?.matchesPlayed || 0}</p>
              <span className="text-[11px] text-slate-400">Completed fixtures</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-xs text-emerald-600 font-semibold">Won</span>
              <p className="text-2xl font-black text-emerald-600 mt-1">{stats?.matchesWon || 0}</p>
              <span className="text-[11px] text-slate-400">Victories recorded</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-xs text-rose-600 font-semibold">Lost</span>
              <p className="text-2xl font-black text-rose-600 mt-1">{stats?.matchesLost || 0}</p>
              <span className="text-[11px] text-slate-400">Eliminations</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-xs text-indigo-600 font-semibold">Upcoming</span>
              <p className="text-2xl font-black text-indigo-600 mt-1">{stats?.matchesUpcoming || 0}</p>
              <span className="text-[11px] text-slate-400">Scheduled fixtures</span>
            </div>
          </div>

          {/* School Teams & Active Tournaments Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Active Tournaments Card */}
            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Icon name="trophy" size="md" className="text-indigo-600" />
                  <span>Enrolled Tournaments</span>
                </h3>
                <span className="text-xs font-semibold text-slate-400">
                  {dashboardData?.tournaments?.length || 0} Published
                </span>
              </div>

              {dashboardData?.tournaments && dashboardData.tournaments.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {dashboardData.tournaments.map((t: any) => (
                    <div key={t.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{t.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {t.ageGroup} ({t.gender}) · {t.sport}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedTournamentFilter(t.id);
                          setActiveTab('schedule');
                        }}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                      >
                        <span>View Matches</span>
                        <Icon name="chevronRight" size="sm" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-3">
                  No tournaments with published fixtures yet.
                </p>
              )}
            </div>

            {/* School Teams Card */}
            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Icon name="users" size="md" className="text-indigo-600" />
                  <span>School Teams Roster</span>
                </h3>
                <span className="text-xs font-semibold text-slate-400">
                  {dashboardData?.teams?.length || 0} Registered
                </span>
              </div>

              {dashboardData?.teams && dashboardData.teams.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {dashboardData.teams.map((team: any) => (
                    <div key={team.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{team.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {team.medium} Medium · {team.ageGroup} ({team.gender})
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedTeamFilter(team.id);
                          setActiveTab('schedule');
                        }}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        Filter
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-3">No teams registered for this school.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MY SCHEDULE */}
      {activeTab === 'schedule' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Date Filter Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
                <button
                  onClick={() => setScheduleDateFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    scheduleDateFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : ''
                  }`}
                >
                  All ({matches.length})
                </button>
                <button
                  onClick={() => setScheduleDateFilter('today')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    scheduleDateFilter === 'today' ? 'bg-white text-slate-900 shadow-2xs font-bold' : ''
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => setScheduleDateFilter('upcoming')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    scheduleDateFilter === 'upcoming' ? 'bg-white text-slate-900 shadow-2xs font-bold' : ''
                  }`}
                >
                  Upcoming
                </button>
                <button
                  onClick={() => setScheduleDateFilter('past')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    scheduleDateFilter === 'past' ? 'bg-white text-slate-900 shadow-2xs font-bold' : ''
                  }`}
                >
                  Completed
                </button>
              </div>

              {/* Tournament & Team Dropdown Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedTournamentFilter}
                  onChange={(e) => setSelectedTournamentFilter(e.target.value)}
                  className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">All Tournaments</option>
                  {dashboardData?.tournaments?.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedTeamFilter}
                  onChange={(e) => setSelectedTeamFilter(e.target.value)}
                  className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">All Teams</option>
                  {dashboardData?.teams?.map((team: any) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Matches List */}
          {filteredMatches.length === 0 ? (
            <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center shadow-xs">
              <Icon name="calendar" size="md" className="text-slate-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-800">No matches found matching criteria</h3>
              <p className="text-xs text-slate-500 mt-1">
                Try switching filters or check back later once fixtures are updated.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMatches.map((m: any) => {
                const formattedDate = m.scheduledAt
                  ? new Date(m.scheduledAt).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Date TBD';

                const formattedTime = m.scheduledAt
                  ? new Date(m.scheduledAt).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Time TBD';

                return (
                  <div
                    key={m.id}
                    className="p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Left: Info & Teams */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                          Match #{m.matchNumber} · {m.roundName}
                        </span>

                        <span className="text-xs font-medium text-slate-500">
                          {m.tournament.name}
                        </span>

                        {m.status === 'completed' && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              m.outcome === 'won'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {m.outcome === 'won' ? (<span className="inline-flex items-center gap-1"><Icon name="check" size="sm" />Won</span>) : (<span className="inline-flex items-center gap-1"><Icon name="xmark" size="sm" />Lost</span>)}
                          </span>
                        )}

                        {m.status !== 'completed' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700">
                            Upcoming
                          </span>
                        )}
                      </div>

                      {/* Opponent & Matchup */}
                      <div>
                        <div className="text-sm sm:text-base font-bold text-slate-900">
                          <span className="text-indigo-600">{m.myTeam?.name}</span>{' '}
                          <span className="text-slate-400 font-normal">vs</span>{' '}
                          <span>{m.opponentDisplay?.label}</span>
                        </div>
                        {m.opponentDisplay?.dependencyText && (
                          <p className="text-xs text-amber-700 font-medium mt-0.5">
                            {m.opponentDisplay.dependencyText}
                          </p>
                        )}
                        {m.byeAdvancementNote && (
                          <p className="text-xs text-indigo-600 font-medium mt-0.5 flex items-center gap-1">
                            <Icon name="shield" size="sm" />
                            <span>{m.byeAdvancementNote}</span>
                          </p>
                        )}
                      </div>

                      {/* Date, Time, Venue */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Icon name="calendar" size="sm" className="text-slate-400" />
                          <span>{formattedDate}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="clock" size="sm" className="text-slate-400" />
                          <span>{formattedTime}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="location" size="sm" className="text-slate-400" />
                          <span>{m.venue || 'DSO Sports Complex'}</span>
                        </span>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                      {m.isAcknowledged ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                          <Icon name="circleCheck" size="sm" className="text-emerald-600" />
                          <span>Acknowledged</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAcknowledge(m.id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors"
                        >
                          Acknowledge
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedMatchData(m)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Details
                      </button>

                      <a
                        href={api.my.getCalendarDownloadUrl(m.id)}
                        download={`match-${m.id}.ics`}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                        title="Download .ics Calendar"
                      >
                        <Icon name="calendarPlus" size="md" className="text-indigo-600" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MY BRACKET PATH */}
      {activeTab === 'bracket' && (
        <div className="space-y-4">
          <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Tournament Route & Path</h3>
              <p className="text-xs text-slate-500">
                Track your school teams' progression path through the tournament bracket.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedBracketTournamentId}
                onChange={(e) => {
                  setSelectedBracketTournamentId(e.target.value);
                  loadBracketPath(e.target.value);
                }}
                className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
              >
                {dashboardData?.tournaments?.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {onOpenPublicBracket && selectedBracketTournamentId && (
                <button
                  onClick={() => onOpenPublicBracket(selectedBracketTournamentId)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  <span>Full Public Bracket</span>
                  <Icon name="external" size="sm" />
                </button>
              )}
            </div>
          </div>

          {bracketPathData && bracketPathData.teamPaths && bracketPathData.teamPaths.length > 0 ? (
            <div className="space-y-6">
              {bracketPathData.teamPaths.map((tp: any) => (
                <div
                  key={tp.team.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {tp.team.medium} Medium · {tp.team.ageGroup} ({tp.team.gender})
                      </span>
                      <h4 className="text-base font-black text-slate-900">{tp.team.name}</h4>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                        tp.overallStatus === 'winner'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : tp.overallStatus === 'eliminated'
                          ? 'bg-rose-50 text-rose-800'
                          : 'bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      {tp.overallStatus === 'winner'
                        ? (<><Icon name="trophy" size="sm" />Tournament Winner</>)
                        : tp.overallStatus === 'eliminated'
                        ? 'Eliminated'
                        : 'Active in Tournament'}
                    </span>
                  </div>

                  {/* Route Steps */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                    {tp.rounds.map((r: any, rIdx: number) => (
                      <div
                        key={r.matchId}
                        className={`p-3.5 rounded-xl border relative ${
                          r.isWinner
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                            : r.isEliminated
                            ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                            : 'bg-indigo-50/50 border-indigo-200 text-indigo-950'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                          <span>{r.roundName}</span>
                          <span>Match #{r.matchNumber}</span>
                        </div>
                        <p className="text-xs font-semibold truncate">
                          vs {r.opponent?.label || 'TBD'}
                        </p>
                        <div className="mt-2 text-[10px] font-medium flex items-center justify-between">
                          <span>
                            {r.status === 'completed'
                              ? r.isWinner
                                ? (<span className="inline-flex items-center gap-1"><Icon name="check" size="sm" />Advanced</span>)
                                : (<span className="inline-flex items-center gap-1"><Icon name="xmark" size="sm" />Eliminated</span>)
                              : 'Upcoming'}
                          </span>
                          {r.score && (
                            <span className="font-bold">
                              {r.score.teamAScore ?? '-'} - {r.score.teamBScore ?? '-'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center shadow-xs">
              <Icon name="layers" size="xl" className="text-slate-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500">
                No active paths found for your school teams in this tournament.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xs flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Notifications & Schedule Alerts</h3>
              <p className="text-xs text-slate-500">
                Official alerts from DSO regarding match rescheduling, venues, and results.
              </p>
            </div>

            {unreadNotifsCount > 0 && (
              <button
                onClick={handleMarkAllNotificationsRead}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                <Icon name="checkDouble" size="sm" className="text-indigo-600" />
                <span>Mark All Read</span>
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center shadow-xs">
              <Icon name="bell" size="md" className="text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">No notifications yet</h4>
              <p className="text-xs text-slate-500 mt-1">
                You'll receive alerts here whenever matches are scheduled, rescheduled, or when fixtures are published.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notifications.map((notif: any) => {
                const isScheduleChange =
                  notif.type === 'schedule_changed' || notif.type === 'venue_changed';

                return (
                  <div
                    key={notif.id}
                    className={`p-4 rounded-xl border transition-all ${
                      notif.isRead
                        ? 'bg-white border-slate-200'
                        : 'bg-indigo-50/70 border-indigo-200 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900">{notif.title}</h4>
                          {isScheduleChange && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              Changed
                            </span>
                          )}
                          {!notif.isRead && (
                            <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                          )}
                        </div>

                        <p className="text-xs text-slate-700 leading-relaxed">{notif.message}</p>

                        {/* Schedule Change Diff */}
                        {isScheduleChange && (notif.oldValue || notif.newValue) && (
                          <div className="mt-2 p-2 bg-white/80 rounded-lg border border-slate-200 text-[11px] space-y-1">
                            {notif.oldValue?.scheduledAt !== notif.newValue?.scheduledAt && (
                              <div>
                                <span className="text-slate-400 line-through mr-2">
                                  Was: {notif.oldValue?.scheduledAt || 'TBD'}
                                </span>
                                <span className="text-emerald-700 font-bold">
                                  Now: {notif.newValue?.scheduledAt || 'TBD'}
                                </span>
                              </div>
                            )}
                            {notif.oldValue?.venue !== notif.newValue?.venue && (
                              <div>
                                <span className="text-slate-400 line-through mr-2">
                                  Was Venue: {notif.oldValue?.venue || 'TBD'}
                                </span>
                                <span className="text-emerald-700 font-bold">
                                  Now Venue: {notif.newValue?.venue || 'TBD'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        <span className="text-[10px] text-slate-400 block pt-1">
                          {new Date(notif.createdAt).toLocaleString()}
                        </span>
                      </div>

                      {!notif.isRead && (
                        <button
                          onClick={() => handleMarkNotificationRead(notif.id)}
                          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 shrink-0"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Match Detail Modal */}
      {selectedMatchData && (
        <MatchDetailModal
          matchData={selectedMatchData}
          isOpen={!!selectedMatchData}
          onClose={() => setSelectedMatchData(null)}
          onAcknowledgeSuccess={() => {
            loadAllData();
          }}
        />
      )}
    </div>
  );
};
