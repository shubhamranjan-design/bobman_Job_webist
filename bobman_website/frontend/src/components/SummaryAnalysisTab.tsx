import { useMemo, useState } from 'react';
import type { SummaryData, GroupBreakdown, GroupDailyBreakdown } from '../api/dashboard';

interface SummaryAnalysisTabProps {
  summary: SummaryData;
}

type ViewMode = 'daily' | 'weekly' | 'overall';
type GroupMode = 'none' | 'team_manager' | 'recruiter';

export function SummaryAnalysisTab({ summary }: SummaryAnalysisTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [groupMode, setGroupMode] = useState<GroupMode>('none');

  const formatDuration = (secs: number): string => {
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr || dateStr === 'Unknown') return dateStr;
    try {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Calculate totals from daily data
  const totals = useMemo(() => {
    return summary.daily.reduce((acc, day) => ({
      users: acc.users + day.users,
      calls: acc.calls + day.calls,
      total_duration: acc.total_duration + day.total_duration,
      connected_users: acc.connected_users + day.connected_users,
      users_gte_4min: acc.users_gte_4min + day.users_gte_4min,
      total_wa: acc.total_wa + day.total_wa,
      wa_out: acc.wa_out + day.wa_out,
      wa_in: acc.wa_in + day.wa_in,
      wa_engaged_users: acc.wa_engaged_users + day.wa_engaged_users,
      users_with_inbound: acc.users_with_inbound + (day.users_with_inbound || 0),
      matches_users: acc.matches_users + day.matches_users,
      interested: acc.interested + day.interested,
      with_cv: acc.with_cv + day.with_cv,
      profile_70plus: acc.profile_70plus + day.profile_70plus,
    }), {
      users: 0,
      calls: 0,
      total_duration: 0,
      connected_users: 0,
      users_gte_4min: 0,
      total_wa: 0,
      wa_out: 0,
      wa_in: 0,
      wa_engaged_users: 0,
      users_with_inbound: 0,
      matches_users: 0,
      interested: 0,
      with_cv: 0,
      profile_70plus: 0,
    });
  }, [summary.daily]);

  // Weekly aggregation
  const weeklyData = useMemo(() => {
    const weeks: Record<string, typeof totals & { date: string }> = {};

    summary.daily.forEach(day => {
      const date = new Date(day.date + 'T00:00:00');
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay());
      const weekKey = 'Wk ' + startOfWeek.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

      if (!weeks[weekKey]) {
        weeks[weekKey] = {
          date: weekKey,
          users: 0, calls: 0, total_duration: 0, connected_users: 0, users_gte_4min: 0,
          total_wa: 0, wa_out: 0, wa_in: 0, wa_engaged_users: 0, users_with_inbound: 0,
          matches_users: 0, interested: 0, with_cv: 0, profile_70plus: 0,
        };
      }

      weeks[weekKey].users += day.users;
      weeks[weekKey].calls += day.calls;
      weeks[weekKey].total_duration += day.total_duration;
      weeks[weekKey].connected_users += day.connected_users;
      weeks[weekKey].users_gte_4min += day.users_gte_4min;
      weeks[weekKey].total_wa += day.total_wa;
      weeks[weekKey].wa_out += day.wa_out;
      weeks[weekKey].wa_in += day.wa_in;
      weeks[weekKey].wa_engaged_users += day.wa_engaged_users;
      weeks[weekKey].users_with_inbound += day.users_with_inbound || 0;
      weeks[weekKey].matches_users += day.matches_users;
      weeks[weekKey].interested += day.interested;
      weeks[weekKey].with_cv += day.with_cv;
      weeks[weekKey].profile_70plus += day.profile_70plus;
    });

    return Object.values(weeks).sort((a, b) => b.date.localeCompare(a.date));
  }, [summary.daily]);

  const displayData = useMemo(() => {
    if (viewMode === 'overall') return [{ ...totals, date: 'Overall' }];
    if (viewMode === 'weekly') return weeklyData;
    return summary.daily;
  }, [viewMode, totals, weeklyData, summary.daily]);

  // Get grouped data based on groupMode (overall aggregation)
  const groupedData: GroupBreakdown[] | null = useMemo(() => {
    if (groupMode === 'none') return null;
    if (groupMode === 'team_manager') return summary.team_manager_breakdown || [];
    if (groupMode === 'recruiter') return summary.recruiter_breakdown || [];
    return null;
  }, [groupMode, summary.team_manager_breakdown, summary.recruiter_breakdown]);

  // Get daily grouped data based on groupMode
  const dailyGroupedData: GroupDailyBreakdown[] | null = useMemo(() => {
    if (groupMode === 'none') return null;
    if (groupMode === 'team_manager') return summary.team_manager_daily || [];
    if (groupMode === 'recruiter') return summary.recruiter_daily || [];
    return null;
  }, [groupMode, summary.team_manager_daily, summary.recruiter_daily]);

  // Show daily group table when viewMode is 'daily' and groupMode is not 'none'
  const showDailyGroupTable = viewMode === 'daily' && groupMode !== 'none' && dailyGroupedData && dailyGroupedData.length > 0;

  // Calculate totals for daily grouped data
  const dailyGroupedTotals = useMemo(() => {
    if (!dailyGroupedData || dailyGroupedData.length === 0) return null;
    return dailyGroupedData.reduce((acc, g) => ({
      users: acc.users + g.users,
      calls: acc.calls + g.calls,
      total_duration: acc.total_duration + g.total_duration,
      connected_users: acc.connected_users + g.connected_users,
      users_gte_4min: acc.users_gte_4min + g.users_gte_4min,
      total_wa: acc.total_wa + g.total_wa,
      wa_out: acc.wa_out + g.wa_out,
      wa_in: acc.wa_in + g.wa_in,
      wa_engaged_users: acc.wa_engaged_users + g.wa_engaged_users,
      users_with_inbound: acc.users_with_inbound + g.users_with_inbound,
      matches_users: acc.matches_users + g.matches_users,
      interested: acc.interested + g.interested,
      with_cv: acc.with_cv + g.with_cv,
      profile_70plus: acc.profile_70plus + g.profile_70plus,
      wa_connected: acc.wa_connected + (g.wa_connected || 0),
      wa_failed: acc.wa_failed + (g.wa_failed || 0),
      wa_reconnected: acc.wa_reconnected + (g.wa_reconnected || 0),
    }), {
      users: 0, calls: 0, total_duration: 0, connected_users: 0, users_gte_4min: 0,
      total_wa: 0, wa_out: 0, wa_in: 0, wa_engaged_users: 0, users_with_inbound: 0,
      matches_users: 0, interested: 0, with_cv: 0, profile_70plus: 0,
      wa_connected: 0, wa_failed: 0, wa_reconnected: 0,
    });
  }, [dailyGroupedData]);

  // Calculate grouped totals
  const groupedTotals = useMemo(() => {
    if (!groupedData || groupedData.length === 0) return null;
    return groupedData.reduce((acc, g) => ({
      users: acc.users + g.users,
      calls: acc.calls + g.calls,
      total_duration: acc.total_duration + g.total_duration,
      connected_users: acc.connected_users + g.connected_users,
      users_gte_4min: acc.users_gte_4min + g.users_gte_4min,
      total_wa: acc.total_wa + g.total_wa,
      wa_out: acc.wa_out + g.wa_out,
      wa_in: acc.wa_in + g.wa_in,
      wa_engaged_users: acc.wa_engaged_users + g.wa_engaged_users,
      users_with_inbound: acc.users_with_inbound + g.users_with_inbound,
      matches_users: acc.matches_users + g.matches_users,
      interested: acc.interested + g.interested,
      with_cv: acc.with_cv + g.with_cv,
      profile_70plus: acc.profile_70plus + g.profile_70plus,
      wa_connected: acc.wa_connected + (g.wa_connected || 0),
      wa_failed: acc.wa_failed + (g.wa_failed || 0),
      wa_reconnected: acc.wa_reconnected + (g.wa_reconnected || 0),
    }), {
      users: 0, calls: 0, total_duration: 0, connected_users: 0, users_gte_4min: 0,
      total_wa: 0, wa_out: 0, wa_in: 0, wa_engaged_users: 0, users_with_inbound: 0,
      matches_users: 0, interested: 0, with_cv: 0, profile_70plus: 0,
      wa_connected: 0, wa_failed: 0, wa_reconnected: 0,
    });
  }, [groupedData]);

  const maxStatusCount = summary.status_breakdown.length > 0 ? summary.status_breakdown[0].count : 1;
  const maxFeedbackCount = summary.feedback_breakdown.length > 0 ? summary.feedback_breakdown[0].count : 1;

  return (
    <div className="space-y-4">
      {/* Header Controls with Toggle Buttons */}
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

            <span className="text-sm text-slate-500">{totals.users} users</span>
          </div>
        </div>
      </div>

      {/* Daily Grouped Analysis - Daily breakdown per Team Manager / Recruiter */}
      {showDailyGroupTable && dailyGroupedData && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">
              📅 Daily {groupMode === 'team_manager' ? 'Team Manager' : 'Recruiter'} Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300 sticky left-0 bg-slate-50 dark:bg-slate-700/50 z-10">Date</th>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">
                    {groupMode === 'team_manager' ? 'Team Manager' : 'Recruiter'}
                  </th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Users</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Calls</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Tot Dur</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Avg/Conn</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Conn</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Conn%</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">&gt;=4m</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">&gt;=4m%</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA Conn</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA Fail</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA Reconn</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Tot WA</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA Out</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA In</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Inb Users</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Inb%</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Match</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Match%</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Int</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Int%</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">CV</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">CV%</th>
                </tr>
              </thead>
              <tbody>
                {dailyGroupedData.map((row, idx) => {
                  const avgDurConn = row.connected_users > 0 ? Math.round(row.total_duration / row.connected_users) : 0;
                  const connPct = row.users > 0 ? ((row.connected_users / row.users) * 100).toFixed(1) : '0';
                  const gte4mPct = row.users > 0 ? ((row.users_gte_4min / row.users) * 100).toFixed(1) : '0';
                  const inbPct = row.users > 0 ? ((row.users_with_inbound / row.users) * 100).toFixed(1) : '0';
                  const matchPct = row.users > 0 ? ((row.matches_users / row.users) * 100).toFixed(1) : '0';
                  const intPct = row.users > 0 ? ((row.interested / row.users) * 100).toFixed(1) : '0';
                  const cvPct = row.users > 0 ? ((row.with_cv / row.users) * 100).toFixed(1) : '0';

                  return (
                    <tr key={idx} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="p-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                        {formatDate(row.date)}
                      </td>
                      <td className="p-2 text-slate-600 dark:text-slate-400 max-w-[150px] truncate" title={row.name}>
                        {row.name}
                      </td>
                      <td className="p-2 text-right text-blue-600">{row.users}</td>
                      <td className="p-2 text-right">{row.calls}</td>
                      <td className="p-2 text-right">{formatDuration(row.total_duration)}</td>
                      <td className="p-2 text-right text-amber-600">{formatDuration(avgDurConn)}</td>
                      <td className="p-2 text-right text-green-600">{row.connected_users}</td>
                      <td className="p-2 text-right text-green-500">{connPct}%</td>
                      <td className="p-2 text-right text-emerald-600">{row.users_gte_4min}</td>
                      <td className="p-2 text-right text-emerald-500">{gte4mPct}%</td>
                      <td className="p-2 text-right text-green-600">{row.wa_connected}</td>
                      <td className="p-2 text-right text-red-600">{row.wa_failed}</td>
                      <td className="p-2 text-right text-yellow-600">{row.wa_reconnected}</td>
                      <td className="p-2 text-right">{row.total_wa}</td>
                      <td className="p-2 text-right text-cyan-600">{row.wa_out}</td>
                      <td className="p-2 text-right text-teal-600">{row.wa_in}</td>
                      <td className="p-2 text-right text-orange-600">{row.users_with_inbound}</td>
                      <td className="p-2 text-right text-orange-500">{inbPct}%</td>
                      <td className="p-2 text-right text-purple-600">{row.matches_users}</td>
                      <td className="p-2 text-right text-purple-500">{matchPct}%</td>
                      <td className="p-2 text-right text-pink-600">{row.interested}</td>
                      <td className="p-2 text-right text-pink-500">{intPct}%</td>
                      <td className="p-2 text-right">{row.with_cv}</td>
                      <td className="p-2 text-right text-slate-500">{cvPct}%</td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                {dailyGroupedTotals && (() => {
                  const t = dailyGroupedTotals;
                  const tConnPct = t.users > 0 ? ((t.connected_users / t.users) * 100).toFixed(1) : '0';
                  const tGte4mPct = t.users > 0 ? ((t.users_gte_4min / t.users) * 100).toFixed(1) : '0';
                  const tInbPct = t.users > 0 ? ((t.users_with_inbound / t.users) * 100).toFixed(1) : '0';
                  const tMatchPct = t.users > 0 ? ((t.matches_users / t.users) * 100).toFixed(1) : '0';
                  const tIntPct = t.users > 0 ? ((t.interested / t.users) * 100).toFixed(1) : '0';
                  const tCvPct = t.users > 0 ? ((t.with_cv / t.users) * 100).toFixed(1) : '0';
                  return (
                    <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700/50 font-semibold sticky bottom-0">
                      <td className="p-2 sticky left-0 bg-slate-100 dark:bg-slate-700/50 z-10" colSpan={2}>Total</td>
                      <td className="p-2 text-right text-blue-600">{t.users}</td>
                      <td className="p-2 text-right">{t.calls}</td>
                      <td className="p-2 text-right">{formatDuration(t.total_duration)}</td>
                      <td className="p-2 text-right text-amber-600">{formatDuration(t.connected_users > 0 ? Math.round(t.total_duration / t.connected_users) : 0)}</td>
                      <td className="p-2 text-right text-green-600">{t.connected_users}</td>
                      <td className="p-2 text-right text-green-500">{tConnPct}%</td>
                      <td className="p-2 text-right text-emerald-600">{t.users_gte_4min}</td>
                      <td className="p-2 text-right text-emerald-500">{tGte4mPct}%</td>
                      <td className="p-2 text-right text-green-600">{t.wa_connected}</td>
                      <td className="p-2 text-right text-red-600">{t.wa_failed}</td>
                      <td className="p-2 text-right text-yellow-600">{t.wa_reconnected}</td>
                      <td className="p-2 text-right">{t.total_wa}</td>
                      <td className="p-2 text-right text-cyan-600">{t.wa_out}</td>
                      <td className="p-2 text-right text-teal-600">{t.wa_in}</td>
                      <td className="p-2 text-right text-orange-600">{t.users_with_inbound}</td>
                      <td className="p-2 text-right text-orange-500">{tInbPct}%</td>
                      <td className="p-2 text-right text-purple-600">{t.matches_users}</td>
                      <td className="p-2 text-right text-purple-500">{tMatchPct}%</td>
                      <td className="p-2 text-right text-pink-600">{t.interested}</td>
                      <td className="p-2 text-right text-pink-500">{tIntPct}%</td>
                      <td className="p-2 text-right">{t.with_cv}</td>
                      <td className="p-2 text-right text-slate-500">{tCvPct}%</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grouped Analysis - Team Manager / Recruiter Comparison (Weekly/Overall) */}
      {groupMode !== 'none' && viewMode !== 'daily' && groupedData && groupedData.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">
              👥 {groupMode === 'team_manager' ? 'Team Manager' : 'Recruiter'} Comparison
            </h3>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300 sticky left-0 bg-slate-50 dark:bg-slate-700/50 z-10">
                    {groupMode === 'team_manager' ? 'Team Manager' : 'Recruiter'}
                  </th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Users</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Calls</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Tot Dur</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Avg/Conn</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Conn</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Conn%</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">&gt;=4m</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">&gt;=4m%</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA Conn</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA Fail</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA Reconn</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Tot WA</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA Out</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA In</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Inb Users</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Inb%</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Match</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Match%</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Int</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Int%</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">CV</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">CV%</th>
                </tr>
              </thead>
              <tbody>
                {groupedData.map((row, idx) => {
                  const avgDurConn = row.connected_users > 0 ? Math.round(row.total_duration / row.connected_users) : 0;
                  const connPct = row.users > 0 ? ((row.connected_users / row.users) * 100).toFixed(1) : '0';
                  const gte4mPct = row.users > 0 ? ((row.users_gte_4min / row.users) * 100).toFixed(1) : '0';
                  const inbPct = row.users > 0 ? ((row.users_with_inbound / row.users) * 100).toFixed(1) : '0';
                  const matchPct = row.users > 0 ? ((row.matches_users / row.users) * 100).toFixed(1) : '0';
                  const intPct = row.users > 0 ? ((row.interested / row.users) * 100).toFixed(1) : '0';
                  const cvPct = row.users > 0 ? ((row.with_cv / row.users) * 100).toFixed(1) : '0';

                  return (
                    <tr key={idx} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="p-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10 max-w-[180px] truncate" title={row.name}>
                        {row.name}
                      </td>
                      <td className="p-2 text-right text-blue-600">{row.users}</td>
                      <td className="p-2 text-right">{row.calls}</td>
                      <td className="p-2 text-right">{formatDuration(row.total_duration)}</td>
                      <td className="p-2 text-right text-amber-600">{formatDuration(avgDurConn)}</td>
                      <td className="p-2 text-right text-green-600">{row.connected_users}</td>
                      <td className="p-2 text-right text-green-500">{connPct}%</td>
                      <td className="p-2 text-right text-emerald-600">{row.users_gte_4min}</td>
                      <td className="p-2 text-right text-emerald-500">{gte4mPct}%</td>
                      <td className="p-2 text-right text-green-600">{row.wa_connected}</td>
                      <td className="p-2 text-right text-red-600">{row.wa_failed}</td>
                      <td className="p-2 text-right text-yellow-600">{row.wa_reconnected}</td>
                      <td className="p-2 text-right">{row.total_wa}</td>
                      <td className="p-2 text-right text-cyan-600">{row.wa_out}</td>
                      <td className="p-2 text-right text-teal-600">{row.wa_in}</td>
                      <td className="p-2 text-right text-orange-600">{row.users_with_inbound}</td>
                      <td className="p-2 text-right text-orange-500">{inbPct}%</td>
                      <td className="p-2 text-right text-purple-600">{row.matches_users}</td>
                      <td className="p-2 text-right text-purple-500">{matchPct}%</td>
                      <td className="p-2 text-right text-pink-600">{row.interested}</td>
                      <td className="p-2 text-right text-pink-500">{intPct}%</td>
                      <td className="p-2 text-right">{row.with_cv}</td>
                      <td className="p-2 text-right text-slate-500">{cvPct}%</td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                {groupedTotals && (() => {
                  const t = groupedTotals;
                  const tConnPct = t.users > 0 ? ((t.connected_users / t.users) * 100).toFixed(1) : '0';
                  const tGte4mPct = t.users > 0 ? ((t.users_gte_4min / t.users) * 100).toFixed(1) : '0';
                  const tInbPct = t.users > 0 ? ((t.users_with_inbound / t.users) * 100).toFixed(1) : '0';
                  const tMatchPct = t.users > 0 ? ((t.matches_users / t.users) * 100).toFixed(1) : '0';
                  const tIntPct = t.users > 0 ? ((t.interested / t.users) * 100).toFixed(1) : '0';
                  const tCvPct = t.users > 0 ? ((t.with_cv / t.users) * 100).toFixed(1) : '0';
                  return (
                    <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700/50 font-semibold sticky bottom-0">
                      <td className="p-2 sticky left-0 bg-slate-100 dark:bg-slate-700/50 z-10">Total</td>
                      <td className="p-2 text-right text-blue-600">{t.users}</td>
                      <td className="p-2 text-right">{t.calls}</td>
                      <td className="p-2 text-right">{formatDuration(t.total_duration)}</td>
                      <td className="p-2 text-right text-amber-600">{formatDuration(t.connected_users > 0 ? Math.round(t.total_duration / t.connected_users) : 0)}</td>
                      <td className="p-2 text-right text-green-600">{t.connected_users}</td>
                      <td className="p-2 text-right text-green-500">{tConnPct}%</td>
                      <td className="p-2 text-right text-emerald-600">{t.users_gte_4min}</td>
                      <td className="p-2 text-right text-emerald-500">{tGte4mPct}%</td>
                      <td className="p-2 text-right text-green-600">{t.wa_connected}</td>
                      <td className="p-2 text-right text-red-600">{t.wa_failed}</td>
                      <td className="p-2 text-right text-yellow-600">{t.wa_reconnected}</td>
                      <td className="p-2 text-right">{t.total_wa}</td>
                      <td className="p-2 text-right text-cyan-600">{t.wa_out}</td>
                      <td className="p-2 text-right text-teal-600">{t.wa_in}</td>
                      <td className="p-2 text-right text-orange-600">{t.users_with_inbound}</td>
                      <td className="p-2 text-right text-orange-500">{tInbPct}%</td>
                      <td className="p-2 text-right text-purple-600">{t.matches_users}</td>
                      <td className="p-2 text-right text-purple-500">{tMatchPct}%</td>
                      <td className="p-2 text-right text-pink-600">{t.interested}</td>
                      <td className="p-2 text-right text-pink-500">{tIntPct}%</td>
                      <td className="p-2 text-right">{t.with_cv}</td>
                      <td className="p-2 text-right text-slate-500">{tCvPct}%</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Period Table - Only show when groupMode is 'none' */}
      {groupMode === 'none' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300 sticky left-0 bg-slate-50 dark:bg-slate-700/50 z-10">Period</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Users</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Calls</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Tot Dur</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Avg/Conn</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Avg/User</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Conn</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">&gt;=4m</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Tot WA</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA Out</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA In</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Inb Users</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Avg WA/Eng</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Match</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Int</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">CV</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">70%+</th>
                </tr>
              </thead>
              <tbody>
                {displayData.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="p-8 text-center text-slate-500">No data for analysis</td>
                  </tr>
                ) : (
                  <>
                    {displayData.map((row, idx) => {
                      const avgDurConn = row.connected_users > 0 ? Math.round(row.total_duration / row.connected_users) : 0;
                      const avgDurUser = row.users > 0 ? Math.round(row.total_duration / row.users) : 0;
                      const avgWAEng = row.wa_engaged_users > 0 ? (row.total_wa / row.wa_engaged_users).toFixed(1) : '0';

                      return (
                        <tr key={idx} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="p-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                            {row.date === 'Overall' || row.date.startsWith('Wk ') ? row.date : formatDate(row.date)}
                          </td>
                          <td className="p-2 text-right text-blue-600">{row.users}</td>
                          <td className="p-2 text-right">{row.calls}</td>
                          <td className="p-2 text-right">{formatDuration(row.total_duration)}</td>
                          <td className="p-2 text-right text-amber-600">{formatDuration(avgDurConn)}</td>
                          <td className="p-2 text-right">{formatDuration(avgDurUser)}</td>
                          <td className="p-2 text-right text-green-600">{row.connected_users}</td>
                          <td className="p-2 text-right text-emerald-600">{row.users_gte_4min}</td>
                          <td className="p-2 text-right">{row.total_wa}</td>
                          <td className="p-2 text-right text-cyan-600">{row.wa_out}</td>
                          <td className="p-2 text-right text-teal-600">{row.wa_in}</td>
                          <td className="p-2 text-right text-orange-600">{row.users_with_inbound || 0}</td>
                          <td className="p-2 text-right">{avgWAEng}</td>
                          <td className="p-2 text-right text-purple-600">{row.matches_users}</td>
                          <td className="p-2 text-right text-pink-600">{row.interested}</td>
                          <td className="p-2 text-right">{row.with_cv}</td>
                          <td className="p-2 text-right">{row.profile_70plus}</td>
                        </tr>
                      );
                    })}
                    {/* Totals row - only show in daily/weekly view with multiple rows */}
                    {viewMode !== 'overall' && displayData.length > 1 && (
                      <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700/50 font-semibold sticky bottom-0">
                        <td className="p-2 sticky left-0 bg-slate-100 dark:bg-slate-700/50 z-10">Total</td>
                        <td className="p-2 text-right text-blue-600">{totals.users}</td>
                        <td className="p-2 text-right">{totals.calls}</td>
                        <td className="p-2 text-right">{formatDuration(totals.total_duration)}</td>
                        <td className="p-2 text-right text-amber-600">{formatDuration(totals.connected_users > 0 ? Math.round(totals.total_duration / totals.connected_users) : 0)}</td>
                        <td className="p-2 text-right">{formatDuration(totals.users > 0 ? Math.round(totals.total_duration / totals.users) : 0)}</td>
                        <td className="p-2 text-right text-green-600">{totals.connected_users}</td>
                        <td className="p-2 text-right text-emerald-600">{totals.users_gte_4min}</td>
                        <td className="p-2 text-right">{totals.total_wa}</td>
                        <td className="p-2 text-right text-cyan-600">{totals.wa_out}</td>
                        <td className="p-2 text-right text-teal-600">{totals.wa_in}</td>
                        <td className="p-2 text-right text-orange-600">{totals.users_with_inbound}</td>
                        <td className="p-2 text-right">{totals.wa_engaged_users > 0 ? (totals.total_wa / totals.wa_engaged_users).toFixed(1) : '0'}</td>
                        <td className="p-2 text-right text-purple-600">{totals.matches_users}</td>
                        <td className="p-2 text-right text-pink-600">{totals.interested}</td>
                        <td className="p-2 text-right">{totals.with_cv}</td>
                        <td className="p-2 text-right">{totals.profile_70plus}</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status Breakdown Panels - Only show when groupMode is 'none' */}
      {groupMode === 'none' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Status Split */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4">Status Distribution</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {summary.status_breakdown.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-28 text-xs text-slate-600 dark:text-slate-400 truncate" title={item.status}>
                    {item.status}
                  </div>
                  <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${(item.count / maxStatusCount) * 100}%`, minWidth: item.count > 0 ? '24px' : '0' }}
                    >
                      <span className="text-xs text-white font-medium">{item.count}</span>
                    </div>
                  </div>
                  <div className="w-12 text-xs text-slate-500 text-right">
                    {totals.users > 0 ? ((item.count / totals.users) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recruiter Feedback Status Split */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4">Recruiter Feedback Status</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {summary.feedback_breakdown.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-28 text-xs text-slate-600 dark:text-slate-400 truncate" title={item.status}>
                    {item.status}
                  </div>
                  <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${(item.count / maxFeedbackCount) * 100}%`, minWidth: item.count > 0 ? '24px' : '0' }}
                    >
                      <span className="text-xs text-white font-medium">{item.count}</span>
                    </div>
                  </div>
                  <div className="w-12 text-xs text-slate-500 text-right">
                    {totals.users > 0 ? ((item.count / totals.users) * 100).toFixed(1) : 0}%
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
          <div className="text-xl font-bold text-blue-500">{totals.users}</div>
          <div className="text-xs text-slate-500">Users</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-amber-500">{totals.calls}</div>
          <div className="text-xs text-slate-500">Calls</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-green-500">{totals.connected_users}</div>
          <div className="text-xs text-slate-500">Connected</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-emerald-500">{totals.users_gte_4min}</div>
          <div className="text-xs text-slate-500">&gt;=4min</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-cyan-500">{totals.total_wa}</div>
          <div className="text-xs text-slate-500">WA Msgs</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-purple-500">{totals.matches_users}</div>
          <div className="text-xs text-slate-500">Matches</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-pink-500">{totals.interested}</div>
          <div className="text-xs text-slate-500">Interested</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-indigo-500">{totals.with_cv}</div>
          <div className="text-xs text-slate-500">With CV</div>
        </div>
      </div>
    </div>
  );
}
