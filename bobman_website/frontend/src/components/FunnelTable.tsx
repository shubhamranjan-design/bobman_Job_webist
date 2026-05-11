import { useMemo, useState } from 'react';
import type { User, WhatsAppMessage, Call, Match, JD } from '../types';

interface FunnelTableProps {
  users: User[];
  whatsapp: WhatsAppMessage[];
  calls: Call[];
  matches: Match[];
  jds: JD[];
}

type ViewMode = 'overall' | 'daily' | 'byStatus';

interface FunnelStage {
  name: string;
  count: number;
  percentage: number;
  color: string;
  icon: string;
}

export function FunnelTable({ users, whatsapp, calls, matches, jds: _jds }: FunnelTableProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('overall');

  // Calculate overall funnel stages
  const overallFunnel = useMemo(() => {
    const total = users.length;
    if (total === 0) return [];

    // Users with WA contact
    const usersWithWA = new Set<string>();
    whatsapp.forEach(w => {
      if (w.user_id) usersWithWA.add(w.user_id);
    });

    // Users with successful WA (non-failed status)
    const usersWithSuccessWA = new Set<string>();
    whatsapp.forEach(w => {
      if (w.user_id && !['failed', 'error', 'undelivered'].includes((w.status || '').toLowerCase())) {
        usersWithSuccessWA.add(w.user_id);
      }
    });

    // Users with calls
    const usersWithCalls = new Set<string>();
    calls.forEach(c => {
      if (c.user_id) usersWithCalls.add(c.user_id);
    });

    // Users with successful calls
    const usersWithSuccessCalls = new Set<string>();
    calls.forEach(c => {
      if (c.user_id && c.status === 'done') {
        usersWithSuccessCalls.add(c.user_id);
      }
    });

    // Users with CV
    const usersWithCV = users.filter(u => u.linkedin_cv_text || u.file_cv_text || u.cv_file_url).length;

    // Users with matches
    const usersWithMatches = new Set<string>();
    matches.forEach(m => {
      if (m.candidate_id) usersWithMatches.add(m.candidate_id);
    });

    // Users with interest
    const usersWithInterest = users.filter(u => (u.jobs_interested_count || 0) > 0).length;

    const stages: FunnelStage[] = [
      { name: 'Total Users', count: total, percentage: 100, color: 'bg-blue-500', icon: '👥' },
      { name: 'WA Contacted', count: usersWithWA.size, percentage: (usersWithWA.size / total) * 100, color: 'bg-green-500', icon: '💬' },
      { name: 'WA Connected', count: usersWithSuccessWA.size, percentage: (usersWithSuccessWA.size / total) * 100, color: 'bg-emerald-500', icon: '✅' },
      { name: 'Calls Attempted', count: usersWithCalls.size, percentage: (usersWithCalls.size / total) * 100, color: 'bg-amber-500', icon: '📞' },
      { name: 'Calls Successful', count: usersWithSuccessCalls.size, percentage: (usersWithSuccessCalls.size / total) * 100, color: 'bg-orange-500', icon: '🎯' },
      { name: 'CV Uploaded', count: usersWithCV, percentage: (usersWithCV / total) * 100, color: 'bg-cyan-500', icon: '📄' },
      { name: 'Job Matches', count: usersWithMatches.size, percentage: (usersWithMatches.size / total) * 100, color: 'bg-purple-500', icon: '🎯' },
      { name: 'Interest Shown', count: usersWithInterest, percentage: (usersWithInterest / total) * 100, color: 'bg-pink-500', icon: '❤️' },
    ];

    return stages;
  }, [users, whatsapp, calls, matches]);

  // Calculate daily funnel data
  const dailyFunnel = useMemo(() => {
    const dailyData: Record<string, {
      date: string;
      users: number;
      waContacted: number;
      waConnected: number;
      calls: number;
      successCalls: number;
      cvs: number;
      matches: number;
      interested: number;
    }> = {};

    // Group users by day
    users.forEach(u => {
      const date = u.created_at ? u.created_at.split('T')[0] : 'unknown';
      if (!dailyData[date]) {
        dailyData[date] = {
          date,
          users: 0,
          waContacted: 0,
          waConnected: 0,
          calls: 0,
          successCalls: 0,
          cvs: 0,
          matches: 0,
          interested: 0,
        };
      }
      dailyData[date].users++;
      if (u.linkedin_cv_text || u.file_cv_text || u.cv_file_url) dailyData[date].cvs++;
      if ((u.jobs_interested_count || 0) > 0) dailyData[date].interested++;
    });

    // Group WA by day
    whatsapp.forEach(w => {
      const date = w.created_at ? w.created_at.split('T')[0] : 'unknown';
      if (!dailyData[date]) return;
      dailyData[date].waContacted++;
      if (!['failed', 'error', 'undelivered'].includes((w.status || '').toLowerCase())) {
        dailyData[date].waConnected++;
      }
    });

    // Group calls by day
    calls.forEach(c => {
      const date = c.created_at ? c.created_at.split('T')[0] : 'unknown';
      if (!dailyData[date]) return;
      dailyData[date].calls++;
      if (c.status === 'done') dailyData[date].successCalls++;
    });

    // Group matches by day
    matches.forEach(m => {
      const date = m.matched_at ? m.matched_at.split('T')[0] : 'unknown';
      if (!dailyData[date]) return;
      dailyData[date].matches++;
    });

    return Object.values(dailyData).sort((a, b) => b.date.localeCompare(a.date));
  }, [users, whatsapp, calls, matches]);

  // Calculate by status funnel
  const statusFunnel = useMemo(() => {
    const statusData: Record<string, { status: string; count: number; withCV: number; withInterest: number; withMatches: number }> = {};

    users.forEach(u => {
      const status = u.status || 'unknown';
      if (!statusData[status]) {
        statusData[status] = { status, count: 0, withCV: 0, withInterest: 0, withMatches: 0 };
      }
      statusData[status].count++;
      if (u.linkedin_cv_text || u.file_cv_text || u.cv_file_url) statusData[status].withCV++;
      if ((u.jobs_interested_count || 0) > 0) statusData[status].withInterest++;
    });

    // Add matches per status
    const matchUserMap = new Map<string, Set<string>>();
    matches.forEach(m => {
      if (!matchUserMap.has(m.candidate_id)) matchUserMap.set(m.candidate_id, new Set());
      matchUserMap.get(m.candidate_id)!.add(m.jd_id);
    });

    users.forEach(u => {
      const status = u.status || 'unknown';
      if (matchUserMap.has(u.id)) {
        statusData[status].withMatches++;
      }
    });

    return Object.values(statusData).sort((a, b) => b.count - a.count);
  }, [users, matches]);

  const maxFunnelCount = overallFunnel.length > 0 ? overallFunnel[0].count : 1;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200 flex-1">
          📊 Conversion Funnel
        </h3>

        {/* View Toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('overall')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'overall' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
            }`}
          >
            📈 Overall
          </button>
          <button
            onClick={() => setViewMode('daily')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'daily' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
            }`}
          >
            📅 Daily
          </button>
          <button
            onClick={() => setViewMode('byStatus')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'byStatus' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
            }`}
          >
            🏷️ By Status
          </button>
        </div>

        <span className="text-sm text-slate-500">{users.length} users tracked</span>
      </div>

      <div className="p-4">
        {viewMode === 'overall' && (
          <div className="space-y-3">
            {overallFunnel.map((stage, idx) => (
              <div key={stage.name} className="relative">
                <div className="flex items-center gap-3">
                  <div className="w-8 text-center text-lg">{stage.icon}</div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{stage.name}</span>
                      <span className="text-sm text-slate-500">
                        {stage.count.toLocaleString()} ({stage.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden relative">
                      <div
                        className={`h-full ${stage.color} rounded-lg transition-all duration-500`}
                        style={{ width: `${(stage.count / maxFunnelCount) * 100}%` }}
                      />
                      {idx > 0 && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-600 dark:text-slate-400">
                          {((stage.count / overallFunnel[idx - 1].count) * 100).toFixed(1)}% from prev
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {idx < overallFunnel.length - 1 && (
                  <div className="ml-12 my-1 text-slate-300 dark:text-slate-600">↓</div>
                )}
              </div>
            ))}
          </div>
        )}

        {viewMode === 'daily' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Date</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Users</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA Out</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">WA OK</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Calls</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Success</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">CVs</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Matches</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Interest</th>
                </tr>
              </thead>
              <tbody>
                {dailyFunnel.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500">No data</td>
                  </tr>
                ) : (
                  dailyFunnel.slice(0, 30).map(day => (
                    <tr key={day.date} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="p-2 font-medium text-slate-700 dark:text-slate-300">{day.date}</td>
                      <td className="p-2 text-right text-blue-600">{day.users}</td>
                      <td className="p-2 text-right text-green-600">{day.waContacted}</td>
                      <td className="p-2 text-right text-emerald-600">{day.waConnected}</td>
                      <td className="p-2 text-right text-amber-600">{day.calls}</td>
                      <td className="p-2 text-right text-orange-600">{day.successCalls}</td>
                      <td className="p-2 text-right text-cyan-600">{day.cvs}</td>
                      <td className="p-2 text-right text-purple-600">{day.matches}</td>
                      <td className="p-2 text-right text-pink-600">{day.interested}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {dailyFunnel.length > 0 && (
                <tfoot className="bg-slate-50 dark:bg-slate-700/50 font-medium">
                  <tr>
                    <td className="p-2">Total</td>
                    <td className="p-2 text-right text-blue-600">{dailyFunnel.reduce((s, d) => s + d.users, 0)}</td>
                    <td className="p-2 text-right text-green-600">{dailyFunnel.reduce((s, d) => s + d.waContacted, 0)}</td>
                    <td className="p-2 text-right text-emerald-600">{dailyFunnel.reduce((s, d) => s + d.waConnected, 0)}</td>
                    <td className="p-2 text-right text-amber-600">{dailyFunnel.reduce((s, d) => s + d.calls, 0)}</td>
                    <td className="p-2 text-right text-orange-600">{dailyFunnel.reduce((s, d) => s + d.successCalls, 0)}</td>
                    <td className="p-2 text-right text-cyan-600">{dailyFunnel.reduce((s, d) => s + d.cvs, 0)}</td>
                    <td className="p-2 text-right text-purple-600">{dailyFunnel.reduce((s, d) => s + d.matches, 0)}</td>
                    <td className="p-2 text-right text-pink-600">{dailyFunnel.reduce((s, d) => s + d.interested, 0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {viewMode === 'byStatus' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Status</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">Users</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">With CV</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">With Interest</th>
                  <th className="text-right p-2 font-medium text-slate-600 dark:text-slate-300">With Matches</th>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {statusFunnel.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">No data</td>
                  </tr>
                ) : (
                  statusFunnel.map(item => (
                    <tr key={item.status} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="p-2">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs font-medium">
                          {item.status}
                        </span>
                      </td>
                      <td className="p-2 text-right font-medium">{item.count}</td>
                      <td className="p-2 text-right text-cyan-600">
                        {item.withCV} <span className="text-slate-400">({((item.withCV / item.count) * 100).toFixed(0)}%)</span>
                      </td>
                      <td className="p-2 text-right text-pink-600">
                        {item.withInterest} <span className="text-slate-400">({((item.withInterest / item.count) * 100).toFixed(0)}%)</span>
                      </td>
                      <td className="p-2 text-right text-purple-600">
                        {item.withMatches} <span className="text-slate-400">({((item.withMatches / item.count) * 100).toFixed(0)}%)</span>
                      </td>
                      <td className="p-2">
                        <div className="w-full h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${(item.count / users.length) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <div className="text-2xl font-bold text-blue-500">{users.length}</div>
          <div className="text-xs text-slate-500 uppercase">Total Users</div>
        </div>
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <div className="text-2xl font-bold text-green-500">
            {overallFunnel.find(f => f.name === 'WA Connected')?.percentage.toFixed(1) || 0}%
          </div>
          <div className="text-xs text-slate-500 uppercase">WA Rate</div>
        </div>
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <div className="text-2xl font-bold text-amber-500">
            {overallFunnel.find(f => f.name === 'Calls Successful')?.percentage.toFixed(1) || 0}%
          </div>
          <div className="text-xs text-slate-500 uppercase">Call Success</div>
        </div>
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <div className="text-2xl font-bold text-pink-500">
            {overallFunnel.find(f => f.name === 'Interest Shown')?.percentage.toFixed(1) || 0}%
          </div>
          <div className="text-xs text-slate-500 uppercase">Interest Rate</div>
        </div>
      </div>
    </div>
  );
}
