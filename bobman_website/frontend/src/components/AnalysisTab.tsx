import { useMemo, useState } from 'react';
import type { User, WhatsAppMessage, Call, Match, JD } from '../types';

interface AnalysisTabProps {
  users: User[];
  whatsapp: WhatsAppMessage[];
  calls: Call[];
  matches: Match[];
  jds: JD[];
  statusBreakdown?: Array<{ status: string; count: number }>;
  feedbackBreakdown?: Array<{ status: string; count: number }>;
}

type ViewMode = 'daily' | 'weekly' | 'overall';
type GroupMode = 'none' | 'team_manager' | 'recruiter';

interface MetricsData {
  users: number;
  calls: number;
  connectedUsers: number;
  usersGte4min: number;
  profCall: number;
  profWithCV: number;
  prof70plus: number;
  matches: number;
  interested: number;
  waFailed: number;
  waReconnected: number;
  waConnected: number;
  totalDuration: number;
  totalWA: number;
  waOut: number;
  waIn: number;
  waEngagedUsers: number;
  referral: number;
}

const initMetrics = (): MetricsData => ({
  users: 0,
  calls: 0,
  connectedUsers: 0,
  usersGte4min: 0,
  profCall: 0,
  profWithCV: 0,
  prof70plus: 0,
  matches: 0,
  interested: 0,
  waFailed: 0,
  waReconnected: 0,
  waConnected: 0,
  totalDuration: 0,
  totalWA: 0,
  waOut: 0,
  waIn: 0,
  waEngagedUsers: 0,
  referral: 0,
});

interface UserEnriched extends User {
  call_stats: { total: number; duration: number; successful: number };
  wa_stats: { total: number; outbound: number; inbound: number };
  match_count: number;
  has_cv: boolean;
  is_interested: boolean;
  is_referral: boolean;
  wa_failed: boolean;
  wa_reconnected: boolean;
  wa_connected: boolean;
}

export function AnalysisTab({ users, whatsapp, calls, matches, jds: _jds, statusBreakdown, feedbackBreakdown }: AnalysisTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [groupMode, setGroupMode] = useState<GroupMode>('none');

  // Build enriched user data with all stats
  const enrichedUsers = useMemo<UserEnriched[]>(() => {
    return users.map(user => {
      const userCalls = calls.filter(c => c.user_id === user.id);
      const totalDuration = userCalls.reduce((sum, c) => sum + (c.call_duration_secs || 0), 0);
      const successfulCalls = userCalls.filter(c => c.status === 'done').length;

      const userWA = whatsapp.filter(w => w.user_id === user.id);
      const waOutbound = userWA.filter(w => w.direction === 'outbound').length;
      const waInbound = userWA.filter(w => w.direction === 'inbound').length;

      const hasFailed = userWA.some(w =>
        ['failed', 'error', 'undelivered'].includes((w.status || '').toLowerCase())
      );
      const hasSuccess = userWA.some(w =>
        !['failed', 'error', 'undelivered'].includes((w.status || '').toLowerCase()) && w.status
      );

      const userMatches = matches.filter(m => m.candidate_id === user.id);

      return {
        ...user,
        call_stats: { total: userCalls.length, duration: totalDuration, successful: successfulCalls },
        wa_stats: { total: userWA.length, outbound: waOutbound, inbound: waInbound },
        match_count: userMatches.length,
        has_cv: !!(user.linkedin_cv_text || user.file_cv_text || user.cv_file_url),
        is_interested: (user.jobs_interested_count || 0) > 0,
        is_referral: !!(user.referred_by_user_id || user.referred_by_code),
        wa_failed: hasFailed && !hasSuccess,
        wa_reconnected: hasFailed && hasSuccess,
        wa_connected: !hasFailed && hasSuccess,
      };
    });
  }, [users, calls, whatsapp, matches]);

  const getPeriodKey = (dateStr: string | undefined, mode: ViewMode): string => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    if (mode === 'daily') {
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } else if (mode === 'weekly') {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay());
      return 'Wk ' + startOfWeek.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    }
    return 'Overall';
  };

  const addUserToMetrics = (m: MetricsData, user: UserEnriched) => {
    m.users++;
    m.calls += user.call_stats.total;
    m.totalDuration += user.call_stats.duration;
    if (user.call_stats.duration > 0) m.connectedUsers++;
    if (user.call_stats.duration >= 240) m.usersGte4min++;
    if (user.call_cv_text) m.profCall++;
    if (user.has_cv) m.profWithCV++;
    if ((user.profile_completion_per || 0) >= 70) m.prof70plus++;
    if (user.match_count > 0) m.matches++;
    if (user.is_interested) m.interested++;
    if (user.is_referral) m.referral++;
    m.totalWA += user.wa_stats.total;
    m.waOut += user.wa_stats.outbound;
    m.waIn += user.wa_stats.inbound;
    if (user.wa_stats.inbound > 0) m.waEngagedUsers++;
    if (user.wa_failed) m.waFailed++;
    if (user.wa_reconnected) m.waReconnected++;
    if (user.wa_connected) m.waConnected++;
  };

  // Group by recruiter/team manager
  const groupedData = useMemo(() => {
    if (groupMode === 'none') return null;
    const groups: Record<string, MetricsData> = {};
    const groupField = groupMode === 'team_manager' ? 'team_manager_email' : 'recruiter_email';
    enrichedUsers.forEach(u => {
      const key = (u as any)[groupField] || '(Not Assigned)';
      if (!groups[key]) groups[key] = initMetrics();
      addUserToMetrics(groups[key], u);
    });
    return Object.entries(groups)
      .map(([key, metrics]) => ({ groupName: key, ...metrics }))
      .sort((a, b) => b.users - a.users);
  }, [enrichedUsers, groupMode]);

  // Time-based period data for the period table
  const periodData = useMemo(() => {
    const periods: Record<string, MetricsData & { periodKey: string }> = {};
    const overall = initMetrics();

    enrichedUsers.forEach(u => {
      addUserToMetrics(overall, u);
      const key = getPeriodKey(u.created_at, viewMode);
      if (!periods[key]) periods[key] = { ...initMetrics(), periodKey: key };
      addUserToMetrics(periods[key], u);
    });

    let periodList = Object.values(periods).sort((a, b) => {
      // Sort by date descending
      return b.periodKey.localeCompare(a.periodKey);
    });

    if (viewMode === 'daily') periodList = periodList.slice(0, 14);
    if (viewMode === 'weekly') periodList = periodList.slice(0, 8);

    return { overall, periodList };
  }, [enrichedUsers, viewMode]);

  // Status breakdown from users (fallback if not provided)
  const localStatusBreakdown = useMemo(() => {
    if (statusBreakdown && statusBreakdown.length > 0) return statusBreakdown;
    const counts: Record<string, number> = {};
    users.forEach(u => {
      const status = u.status || 'Unknown';
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [users, statusBreakdown]);

  // Feedback breakdown from users
  const localFeedbackBreakdown = useMemo(() => {
    if (feedbackBreakdown && feedbackBreakdown.length > 0) return feedbackBreakdown;
    const counts: Record<string, number> = {};
    users.forEach(u => {
      const status = u.recruiter_feedback_status || '(Not Set)';
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [users, feedbackBreakdown]);

  const formatDuration = (secs: number): string => {
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  const groupedTotals = useMemo(() => {
    if (!groupedData) return null;
    return groupedData.reduce((acc, g) => ({
      ...acc,
      users: acc.users + g.users,
      calls: acc.calls + g.calls,
      totalDuration: acc.totalDuration + g.totalDuration,
      connectedUsers: acc.connectedUsers + g.connectedUsers,
      usersGte4min: acc.usersGte4min + g.usersGte4min,
      totalWA: acc.totalWA + g.totalWA,
      waOut: acc.waOut + g.waOut,
      waIn: acc.waIn + g.waIn,
      waEngagedUsers: acc.waEngagedUsers + g.waEngagedUsers,
      matches: acc.matches + g.matches,
      interested: acc.interested + g.interested,
      referral: acc.referral + g.referral,
      profWithCV: acc.profWithCV + g.profWithCV,
      prof70plus: acc.prof70plus + g.prof70plus,
      waFailed: acc.waFailed + g.waFailed,
      waReconnected: acc.waReconnected + g.waReconnected,
      waConnected: acc.waConnected + g.waConnected,
    }), initMetrics());
  }, [groupedData]);

  const maxStatusCount = Math.max(...localStatusBreakdown.map(s => s.count), 1);
  const maxFeedbackCount = Math.max(...localFeedbackBreakdown.map(s => s.count), 1);
  const totalUsers = users.length;

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">📊 Analysis</h3>

          <div className="flex items-center gap-3">
            {/* Time View Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
              <button
                onClick={() => { setViewMode('daily'); setGroupMode('none'); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  viewMode === 'daily' && groupMode === 'none' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
                }`}
              >
                📅 Daily
              </button>
              <button
                onClick={() => { setViewMode('weekly'); setGroupMode('none'); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  viewMode === 'weekly' && groupMode === 'none' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
                }`}
              >
                📆 Weekly
              </button>
              <button
                onClick={() => { setViewMode('overall'); setGroupMode('none'); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  viewMode === 'overall' && groupMode === 'none' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
                }`}
              >
                📈 Overall
              </button>
            </div>

            {/* Group Filter */}
            <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
              <button
                onClick={() => setGroupMode('none')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  groupMode === 'none' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
                }`}
              >
                No Group
              </button>
              <button
                onClick={() => setGroupMode('team_manager')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  groupMode === 'team_manager' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
                }`}
              >
                👥 Team Manager
              </button>
              <button
                onClick={() => setGroupMode('recruiter')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  groupMode === 'recruiter' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
                }`}
              >
                👤 Recruiter
              </button>
            </div>

            <span className="text-sm text-slate-500">{users.length} users</span>
          </div>
        </div>
      </div>

      {/* Grouped Analysis - Team Manager / Recruiter Comparison */}
      {groupMode !== 'none' && groupedData && (
        <>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-700 dark:text-slate-200">
                👥 {groupMode === 'team_manager' ? 'Team Manager' : 'Recruiter'} Comparison
              </h3>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium sticky left-0 bg-slate-50 dark:bg-slate-700/50 z-10">
                      {groupMode === 'team_manager' ? 'Team Manager' : 'Recruiter'}
                    </th>
                    <th className="text-right p-2 font-medium">Users</th>
                    <th className="text-right p-2 font-medium">Calls</th>
                    <th className="text-right p-2 font-medium">Tot Dur</th>
                    <th className="text-right p-2 font-medium">Avg/Conn</th>
                    <th className="text-right p-2 font-medium">Avg/User</th>
                    <th className="text-right p-2 font-medium">Conn</th>
                    <th className="text-right p-2 font-medium">&gt;=4m</th>
                    <th className="text-right p-2 font-medium">Tot WA</th>
                    <th className="text-right p-2 font-medium">WA Out</th>
                    <th className="text-right p-2 font-medium">WA In</th>
                    <th className="text-right p-2 font-medium">Inb Users</th>
                    <th className="text-right p-2 font-medium">Avg WA/Eng</th>
                    <th className="text-right p-2 font-medium">Match</th>
                    <th className="text-right p-2 font-medium">Int</th>
                    <th className="text-right p-2 font-medium">CV</th>
                    <th className="text-right p-2 font-medium">70%+</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedData.map((row, idx) => (
                    <tr key={idx} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="p-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10 max-w-[150px] truncate" title={row.groupName}>
                        {row.groupName}
                      </td>
                      <td className="p-2 text-right text-blue-600">{row.users}</td>
                      <td className="p-2 text-right">{row.calls}</td>
                      <td className="p-2 text-right">{formatDuration(row.totalDuration)}</td>
                      <td className="p-2 text-right text-amber-600">{formatDuration(row.connectedUsers > 0 ? Math.round(row.totalDuration / row.connectedUsers) : 0)}</td>
                      <td className="p-2 text-right">{formatDuration(row.users > 0 ? Math.round(row.totalDuration / row.users) : 0)}</td>
                      <td className="p-2 text-right text-green-600">{row.connectedUsers}</td>
                      <td className="p-2 text-right text-emerald-600">{row.usersGte4min}</td>
                      <td className="p-2 text-right">{row.totalWA}</td>
                      <td className="p-2 text-right text-cyan-600">{row.waOut}</td>
                      <td className="p-2 text-right text-teal-600">{row.waIn}</td>
                      <td className="p-2 text-right text-purple-600">{row.waEngagedUsers}</td>
                      <td className="p-2 text-right">{row.waEngagedUsers > 0 ? (row.totalWA / row.waEngagedUsers).toFixed(1) : '0'}</td>
                      <td className="p-2 text-right text-purple-600">{row.matches}</td>
                      <td className="p-2 text-right text-pink-600">{row.interested}</td>
                      <td className="p-2 text-right text-indigo-600">{row.profWithCV}</td>
                      <td className="p-2 text-right text-orange-600">{row.prof70plus}</td>
                    </tr>
                  ))}
                  {groupedTotals && (
                    <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700/50 font-semibold sticky bottom-0">
                      <td className="p-2 sticky left-0 bg-slate-100 dark:bg-slate-700/50 z-10">Total</td>
                      <td className="p-2 text-right text-blue-600">{groupedTotals.users}</td>
                      <td className="p-2 text-right">{groupedTotals.calls}</td>
                      <td className="p-2 text-right">{formatDuration(groupedTotals.totalDuration)}</td>
                      <td className="p-2 text-right text-amber-600">{formatDuration(groupedTotals.connectedUsers > 0 ? Math.round(groupedTotals.totalDuration / groupedTotals.connectedUsers) : 0)}</td>
                      <td className="p-2 text-right">{formatDuration(groupedTotals.users > 0 ? Math.round(groupedTotals.totalDuration / groupedTotals.users) : 0)}</td>
                      <td className="p-2 text-right text-green-600">{groupedTotals.connectedUsers}</td>
                      <td className="p-2 text-right text-emerald-600">{groupedTotals.usersGte4min}</td>
                      <td className="p-2 text-right">{groupedTotals.totalWA}</td>
                      <td className="p-2 text-right text-cyan-600">{groupedTotals.waOut}</td>
                      <td className="p-2 text-right text-teal-600">{groupedTotals.waIn}</td>
                      <td className="p-2 text-right text-purple-600">{groupedTotals.waEngagedUsers}</td>
                      <td className="p-2 text-right">{groupedTotals.waEngagedUsers > 0 ? (groupedTotals.totalWA / groupedTotals.waEngagedUsers).toFixed(1) : '0'}</td>
                      <td className="p-2 text-right text-purple-600">{groupedTotals.matches}</td>
                      <td className="p-2 text-right text-pink-600">{groupedTotals.interested}</td>
                      <td className="p-2 text-right text-indigo-600">{groupedTotals.profWithCV}</td>
                      <td className="p-2 text-right text-orange-600">{groupedTotals.prof70plus}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Default View - Period Table (like n8n dashboard) */}
      {groupMode === 'none' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="text-left p-2 font-medium">Period</th>
                  <th className="text-right p-2 font-medium">Users</th>
                  <th className="text-right p-2 font-medium">Calls</th>
                  <th className="text-right p-2 font-medium">Tot Dur</th>
                  <th className="text-right p-2 font-medium">Avg/Conn</th>
                  <th className="text-right p-2 font-medium">Avg/User</th>
                  <th className="text-right p-2 font-medium">Conn</th>
                  <th className="text-right p-2 font-medium">&gt;=4m</th>
                  <th className="text-right p-2 font-medium">Tot WA</th>
                  <th className="text-right p-2 font-medium">WA Out</th>
                  <th className="text-right p-2 font-medium">WA In</th>
                  <th className="text-right p-2 font-medium">Inb Users</th>
                  <th className="text-right p-2 font-medium">Avg WA/Eng</th>
                  <th className="text-right p-2 font-medium">Match</th>
                  <th className="text-right p-2 font-medium">Int</th>
                  <th className="text-right p-2 font-medium">CV</th>
                  <th className="text-right p-2 font-medium">70%+</th>
                </tr>
              </thead>
              <tbody>
                {periodData.periodList.map((row, idx) => (
                  <tr key={idx} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="p-2 font-medium text-slate-700 dark:text-slate-300">{row.periodKey}</td>
                    <td className="p-2 text-right text-blue-600">{row.users}</td>
                    <td className="p-2 text-right">{row.calls}</td>
                    <td className="p-2 text-right">{formatDuration(row.totalDuration)}</td>
                    <td className="p-2 text-right text-amber-600">{formatDuration(row.connectedUsers > 0 ? Math.round(row.totalDuration / row.connectedUsers) : 0)}</td>
                    <td className="p-2 text-right">{formatDuration(row.users > 0 ? Math.round(row.totalDuration / row.users) : 0)}</td>
                    <td className="p-2 text-right text-green-600">{row.connectedUsers}</td>
                    <td className="p-2 text-right text-emerald-600">{row.usersGte4min}</td>
                    <td className="p-2 text-right">{row.totalWA}</td>
                    <td className="p-2 text-right text-cyan-600">{row.waOut}</td>
                    <td className="p-2 text-right text-teal-600">{row.waIn}</td>
                    <td className="p-2 text-right text-purple-600">{row.waEngagedUsers}</td>
                    <td className="p-2 text-right">{row.waEngagedUsers > 0 ? (row.totalWA / row.waEngagedUsers).toFixed(1) : '0'}</td>
                    <td className="p-2 text-right text-purple-600">{row.matches}</td>
                    <td className="p-2 text-right text-pink-600">{row.interested}</td>
                    <td className="p-2 text-right text-indigo-600">{row.profWithCV}</td>
                    <td className="p-2 text-right text-orange-600">{row.prof70plus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status Distribution & Recruiter Feedback Status - Side by Side */}
      {groupMode === 'none' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Status Distribution */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4">Status Distribution</h3>
            <div className="space-y-2">
              {localStatusBreakdown.slice(0, 10).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-28 text-xs text-slate-600 dark:text-slate-400 truncate" title={item.status}>
                    {item.status}
                  </div>
                  <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${(item.count / maxStatusCount) * 100}%`, minWidth: item.count > 0 ? '24px' : '0' }}
                    >
                      <span className="text-xs text-white font-medium">{item.count}</span>
                    </div>
                  </div>
                  <div className="w-12 text-right text-xs text-slate-500">
                    {totalUsers > 0 ? ((item.count / totalUsers) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recruiter Feedback Status */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4">Recruiter Feedback Status</h3>
            <div className="space-y-2">
              {localFeedbackBreakdown.slice(0, 10).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-28 text-xs text-slate-600 dark:text-slate-400 truncate" title={item.status}>
                    {item.status}
                  </div>
                  <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-purple-500 rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${(item.count / maxFeedbackCount) * 100}%`, minWidth: item.count > 0 ? '24px' : '0' }}
                    >
                      <span className="text-xs text-white font-medium">{item.count}</span>
                    </div>
                  </div>
                  <div className="w-12 text-right text-xs text-slate-500">
                    {totalUsers > 0 ? ((item.count / totalUsers) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-blue-500">{periodData.overall.users}</div>
          <div className="text-xs text-slate-500">Users</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-amber-500">{periodData.overall.calls}</div>
          <div className="text-xs text-slate-500">Calls</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-green-500">{periodData.overall.connectedUsers}</div>
          <div className="text-xs text-slate-500">Connected</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-emerald-500">{periodData.overall.usersGte4min}</div>
          <div className="text-xs text-slate-500">&gt;=4min</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-cyan-500">{periodData.overall.totalWA}</div>
          <div className="text-xs text-slate-500">WA Msgs</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-purple-500">{periodData.overall.matches}</div>
          <div className="text-xs text-slate-500">Matches</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-pink-500">{periodData.overall.interested}</div>
          <div className="text-xs text-slate-500">Interested</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-indigo-500">{periodData.overall.profWithCV}</div>
          <div className="text-xs text-slate-500">With CV</div>
        </div>
      </div>
    </div>
  );
}
