import { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { StatsGrid } from './components/StatsGrid';
import { Tabs } from './components/Tabs';
import { UsersTable } from './components/UsersTable';
import { WhatsAppTable } from './components/WhatsAppTable';
import { CallsTable } from './components/CallsTable';
import { MatchesTable } from './components/MatchesTable';
import { JDsTable } from './components/JDsTable';
import { InterestedTable } from './components/InterestedTable';
import { FunnelTable } from './components/FunnelTable';
import { UserModal } from './components/UserModal';
import { FiltersPanel, FilterState } from './components/FiltersPanel';
import { SummaryAnalysisTab } from './components/SummaryAnalysisTab';
import { AnalysisTab } from './components/AnalysisTab';
import { CohortBuilder } from './components/CohortBuilder';
import { fetchDashboardSummary, fetchDashboardDetails, SummaryData } from './api/dashboard';
import type { DashboardData, User, WhatsAppMessage, Call, Match } from './types';

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

// Helper to compare numeric values based on condition
function compareNumeric(value: number, condition: string, target: number): boolean {
  switch (condition) {
    case 'gt': return value > target;
    case 'gte': return value >= target;
    case 'lt': return value < target;
    case 'lte': return value <= target;
    case 'eq': return value === target;
    default: return true;
  }
}

function App() {
  const [startDate, setStartDate] = useState(getToday());
  const [endDate, setEndDate] = useState(getToday());

  // Summary data (fast, lightweight)
  const [summary, setSummary] = useState<SummaryData | null>(null);

  // Detailed data (loaded on demand)
  const [detailData, setDetailData] = useState<Partial<DashboardData>>({});
  const [loadedDetails, setLoadedDetails] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('analysis'); // Start with analysis since it's fast
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    fromDate: '',
    toDate: '',
    status: '',
    recruiter: '',
    teamManager: '',
    feedbackStatus: '',
    waOutCondition: '',
    waOutValue: '',
    waInCondition: '',
    waInValue: '',
    waTotalCondition: '',
    waTotalValue: '',
    callTotalCondition: '',
    callTotalValue: '',
    callSuccessCondition: '',
    callSuccessValue: '',
    callNoAnswerCondition: '',
    callNoAnswerValue: '',
    callDurationCondition: '',
    callDurationValue: '',
    profileCondition: '',
    profileValue: '',
    matchScoreCondition: '',
    matchScoreValue: '',
    matchCountCondition: '',
    matchCountValue: '',
    hasCV: '',
    hasInterest: '',
    commType: '',
    waStatus: '',
    msgStatus: '',
  });

  // Load summary data (fast, ~10KB)
  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDashboardSummary(startDate, endDate);
      setSummary(result);
      // Reset detail data when date range changes
      setDetailData({});
      setLoadedDetails(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Load detailed data on demand
  const loadDetails = useCallback(async (types: string[]) => {
    const typesToLoad = types.filter(t => !loadedDetails.has(t));
    if (typesToLoad.length === 0) return;

    setDetailLoading(true);
    try {
      const result = await fetchDashboardDetails(startDate, endDate, typesToLoad);
      setDetailData(prev => ({ ...prev, ...result }));
      setLoadedDetails(prev => new Set([...prev, ...typesToLoad]));
    } catch (err) {
      console.error('Failed to load details:', err);
    } finally {
      setDetailLoading(false);
    }
  }, [startDate, endDate, loadedDetails]);

  // Load data on initial mount
  useEffect(() => {
    loadSummary();
  }, []);

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  // Check if any filter is active (moved here to be available for useEffect below)
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.search ||
      filters.fromDate ||
      filters.toDate ||
      filters.status ||
      filters.recruiter ||
      filters.teamManager ||
      filters.feedbackStatus ||
      filters.waOutCondition ||
      filters.waInCondition ||
      filters.waTotalCondition ||
      filters.callTotalCondition ||
      filters.callSuccessCondition ||
      filters.callNoAnswerCondition ||
      filters.callDurationCondition ||
      filters.profileCondition ||
      filters.matchScoreCondition ||
      filters.matchCountCondition ||
      filters.hasCV ||
      filters.hasInterest ||
      filters.commType ||
      filters.waStatus ||
      filters.msgStatus
    );
  }, [filters]);

  // Load details when switching to tabs that need them, or when filters are active on analysis
  useEffect(() => {
    const tabRequirements: Record<string, string[]> = {
      users: ['users', 'whatsapp', 'calls'],
      interested: ['users', 'whatsapp', 'calls', 'matches', 'jds'],
      whatsapp: ['users', 'whatsapp'],
      calls: ['users', 'calls'],
      matches: ['users', 'matches', 'jds'],
      funnel: ['users', 'whatsapp', 'calls', 'matches', 'jds'],
      jds: ['jds', 'matches'],
      cohorts: ['users', 'whatsapp', 'calls', 'matches'],
    };

    // If filters are active on analysis tab, need detail data for client-side filtering
    if (activeTab === 'analysis' && hasActiveFilters) {
      loadDetails(['users', 'whatsapp', 'calls', 'matches', 'jds']);
      return;
    }

    const required = tabRequirements[activeTab];
    if (required) {
      loadDetails(required);
    }
  }, [activeTab, loadDetails, hasActiveFilters]);

  // Pre-compute user metrics for filtering
  const userMetrics = useMemo(() => {
    const users = detailData.users || [];
    const whatsapp = detailData.whatsapp || [];
    const calls = detailData.calls || [];
    const matches = detailData.matches || [];

    if (!users.length) return new Map<string, {
      waOut: number;
      waIn: number;
      waTotal: number;
      waStatus: string;
      hasFailed: boolean;
      callTotal: number;
      callSuccess: number;
      callNoAnswer: number;
      callDuration: number;
      matchCount: number;
      avgMatchScore: number;
    }>();

    const metrics = new Map<string, {
      waOut: number;
      waIn: number;
      waTotal: number;
      waStatus: string;
      hasFailed: boolean;
      callTotal: number;
      callSuccess: number;
      callNoAnswer: number;
      callDuration: number;
      matchCount: number;
      avgMatchScore: number;
    }>();

    // Initialize metrics for all users
    users.forEach((user: User) => {
      metrics.set(user.id, {
        waOut: 0,
        waIn: 0,
        waTotal: 0,
        waStatus: 'none',
        hasFailed: false,
        callTotal: 0,
        callSuccess: 0,
        callNoAnswer: 0,
        callDuration: 0,
        matchCount: 0,
        avgMatchScore: 0,
      });
    });

    // Calculate WhatsApp metrics
    whatsapp.forEach((msg: WhatsAppMessage) => {
      const userId = msg.user_id;
      if (!userId || !metrics.has(userId)) return;

      const m = metrics.get(userId)!;
      m.waTotal++;
      if (msg.direction === 'outbound') m.waOut++;
      if (msg.direction === 'inbound') m.waIn++;

      const status = (msg.status || '').toLowerCase();
      if (['failed', 'error', 'undelivered'].includes(status)) {
        m.hasFailed = true;
        if (m.waStatus === 'none') m.waStatus = 'failed';
      } else if (m.waStatus === 'failed') {
        m.waStatus = 'reconnected';
      } else if (m.waStatus === 'none') {
        m.waStatus = 'connected';
      }
    });

    // Calculate Call metrics
    calls.forEach((call: Call) => {
      const userId = call.user_id;
      if (!userId || !metrics.has(userId)) return;

      const m = metrics.get(userId)!;
      m.callTotal++;
      if (call.status === 'done') m.callSuccess++;
      if (call.status === 'no-answer') m.callNoAnswer++;
      m.callDuration += call.call_duration_secs || 0;
    });

    // Calculate Match metrics
    const matchesByUser = new Map<string, Match[]>();
    matches.forEach((match: Match) => {
      if (!matchesByUser.has(match.candidate_id)) matchesByUser.set(match.candidate_id, []);
      matchesByUser.get(match.candidate_id)!.push(match);
    });

    matchesByUser.forEach((userMatches, userId) => {
      if (!metrics.has(userId)) return;
      const m = metrics.get(userId)!;
      m.matchCount = userMatches.length;
      m.avgMatchScore = userMatches.reduce((sum, match) => sum + (match.matching_score || 0), 0) / userMatches.length;
    });

    return metrics;
  }, [detailData]);

  // Filter users based on filter state
  const filteredUsers = useMemo(() => {
    const users = detailData.users || [];
    if (!users.length) return [];

    return users.filter((user: User) => {
      const m = userMetrics.get(user.id);

      // Search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchesSearch =
          (user.name || '').toLowerCase().includes(search) ||
          (user.phone_number || '').includes(search) ||
          (user.email || '').toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      // Date filters (for user created_at)
      if (filters.fromDate) {
        const userDate = user.created_at?.split('T')[0];
        if (!userDate || userDate < filters.fromDate) return false;
      }
      if (filters.toDate) {
        const userDate = user.created_at?.split('T')[0];
        if (!userDate || userDate > filters.toDate) return false;
      }

      // Status filter
      if (filters.status && user.status !== filters.status) return false;

      // Recruiter filter
      if (filters.recruiter && user.recruiter_email !== filters.recruiter) return false;

      // Team Manager filter
      if (filters.teamManager && user.team_manager_email !== filters.teamManager) return false;

      // Feedback Status filter
      if (filters.feedbackStatus && user.recruiter_feedback_status !== filters.feedbackStatus) return false;

      // WhatsApp filters
      if (m) {
        if (filters.waOutCondition && filters.waOutValue) {
          if (!compareNumeric(m.waOut, filters.waOutCondition, parseInt(filters.waOutValue))) return false;
        }
        if (filters.waInCondition && filters.waInValue) {
          if (!compareNumeric(m.waIn, filters.waInCondition, parseInt(filters.waInValue))) return false;
        }
        if (filters.waTotalCondition && filters.waTotalValue) {
          if (!compareNumeric(m.waTotal, filters.waTotalCondition, parseInt(filters.waTotalValue))) return false;
        }
        if (filters.waStatus && m.waStatus !== filters.waStatus) return false;
        if (filters.msgStatus === 'has_failed' && !m.hasFailed) return false;
        if (filters.msgStatus === 'all_delivered' && m.hasFailed) return false;

        // Call filters
        if (filters.callTotalCondition && filters.callTotalValue) {
          if (!compareNumeric(m.callTotal, filters.callTotalCondition, parseInt(filters.callTotalValue))) return false;
        }
        if (filters.callSuccessCondition && filters.callSuccessValue) {
          if (!compareNumeric(m.callSuccess, filters.callSuccessCondition, parseInt(filters.callSuccessValue))) return false;
        }
        if (filters.callNoAnswerCondition && filters.callNoAnswerValue) {
          if (!compareNumeric(m.callNoAnswer, filters.callNoAnswerCondition, parseInt(filters.callNoAnswerValue))) return false;
        }
        if (filters.callDurationCondition && filters.callDurationValue) {
          if (!compareNumeric(m.callDuration, filters.callDurationCondition, parseInt(filters.callDurationValue))) return false;
        }

        // Match filters
        if (filters.matchCountCondition && filters.matchCountValue) {
          if (!compareNumeric(m.matchCount, filters.matchCountCondition, parseInt(filters.matchCountValue))) return false;
        }
        if (filters.matchScoreCondition && filters.matchScoreValue) {
          if (!compareNumeric(m.avgMatchScore, filters.matchScoreCondition, parseInt(filters.matchScoreValue))) return false;
        }

        // Communication type filter
        if (filters.commType) {
          const hasCalls = m.callTotal > 0;
          const hasWA = m.waTotal > 0;
          if (filters.commType === 'calls' && !hasCalls) return false;
          if (filters.commType === 'wa' && !hasWA) return false;
          if (filters.commType === 'both' && (!hasCalls || !hasWA)) return false;
          if (filters.commType === 'none' && (hasCalls || hasWA)) return false;
        }
      }

      // Profile completion filter
      if (filters.profileCondition && filters.profileValue) {
        if (!compareNumeric(user.profile_completion_per || 0, filters.profileCondition, parseInt(filters.profileValue))) return false;
      }

      // Has CV filter - check the has_cv field from lightweight user data
      const hasCV = (user as any).has_cv || user.linkedin_cv_text || user.file_cv_text || user.cv_file_url;
      if (filters.hasCV === 'yes' && !hasCV) return false;
      if (filters.hasCV === 'no' && hasCV) return false;

      // Has Interest filter
      if (filters.hasInterest === 'yes' && (user.jobs_interested_count || 0) === 0) return false;
      if (filters.hasInterest === 'no' && (user.jobs_interested_count || 0) > 0) return false;

      return true;
    });
  }, [detailData.users, filters, userMetrics]);

  // Get unique filter options from summary
  const statuses = useMemo(() => {
    return summary?.filters?.statuses || [];
  }, [summary]);

  const recruiters = useMemo(() => {
    return summary?.filters?.recruiters || [];
  }, [summary]);

  const teamManagers = useMemo(() => {
    return summary?.filters?.team_managers || [];
  }, [summary]);

  const feedbackStatuses = useMemo(() => {
    return summary?.filters?.feedback_statuses || [];
  }, [summary]);

  // Calculate counts for tabs from summary
  const tabCounts = useMemo(() => {
    if (!summary) return undefined;
    return {
      users: summary.totals.users,
      interested: summary.totals.interested_users,
      matches: summary.totals.total_matches,
      whatsapp: summary.totals.total_wa,
      calls: summary.totals.calls,
    };
  }, [summary]);

  // Stats for StatsGrid from summary
  const stats = useMemo(() => {
    if (!summary) return null;
    return {
      total_users: summary.totals.users,
      wa_connected: summary.totals.wa_connected,
      wa_failed: summary.totals.wa_failed,
      total_calls: summary.totals.calls,
      successful_calls: summary.totals.successful_calls,
      total_call_duration: summary.totals.total_duration,
      cvs_uploaded: summary.totals.cvs_uploaded,
      interested_users: summary.totals.interested_users,
      total_matches: summary.totals.total_matches,
      emails_sent: 0, // Not in summary yet
      active_jds: summary.totals.active_jds,
    };
  }, [summary]);

  // Check if detail data is needed for current tab
  const needsDetailData = ['users', 'interested', 'whatsapp', 'calls', 'matches', 'funnel', 'jds', 'cohorts'].includes(activeTab);
  const hasRequiredData = activeTab === 'analysis' || (detailData.users && detailData.users.length > 0);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 transition-colors">
      <div className="container mx-auto px-4 py-4 max-w-[1600px]">
        <Header
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
          onLoadData={loadSummary}
          loading={loading}
        />

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
            <p className="font-medium">Error loading data</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={loadSummary}
              className="mt-2 px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Retry
            </button>
          </div>
        )}

        <StatsGrid stats={stats} loading={loading} />

        <FiltersPanel
          statuses={statuses}
          recruiters={recruiters}
          teamManagers={teamManagers}
          feedbackStatuses={feedbackStatuses}
          onFilterChange={setFilters}
        />

        <Tabs activeTab={activeTab} onTabChange={setActiveTab} counts={tabCounts} />

        <div className="mt-4">
          {/* Show loading state for tabs that need detail data */}
          {needsDetailData && detailLoading && !hasRequiredData && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-300">Loading detailed data...</p>
            </div>
          )}

          {activeTab === 'users' && hasRequiredData && (
            <UsersTable
              users={filteredUsers}
              whatsapp={detailData.whatsapp || []}
              calls={detailData.calls || []}
              onUserClick={setSelectedUser}
            />
          )}

          {activeTab === 'interested' && hasRequiredData && (
            <InterestedTable
              users={filteredUsers}
              whatsapp={detailData.whatsapp || []}
              calls={detailData.calls || []}
              matches={detailData.matches || []}
              jds={detailData.jds || []}
              onUserClick={setSelectedUser}
            />
          )}

          {activeTab === 'whatsapp' && hasRequiredData && (
            <WhatsAppTable users={filteredUsers} whatsapp={detailData.whatsapp || []} />
          )}

          {activeTab === 'calls' && hasRequiredData && (
            <CallsTable users={filteredUsers} calls={detailData.calls || []} />
          )}

          {activeTab === 'matches' && hasRequiredData && (
            <MatchesTable
              allUsers={detailData.users || []}
              filteredUsers={filteredUsers}
              matches={detailData.matches || []}
              jds={detailData.jds || []}
            />
          )}

          {activeTab === 'funnel' && hasRequiredData && (
            <FunnelTable
              users={filteredUsers}
              whatsapp={detailData.whatsapp || []}
              calls={detailData.calls || []}
              matches={detailData.matches || []}
              jds={detailData.jds || []}
            />
          )}

          {activeTab === 'jds' && (
            <JDsTable jds={detailData.jds || []} matches={detailData.matches || []} />
          )}

          {activeTab === 'analysis' && summary && !hasActiveFilters && (
            <SummaryAnalysisTab summary={summary} />
          )}

          {activeTab === 'analysis' && hasActiveFilters && detailData.users && (
            <AnalysisTab
              users={filteredUsers}
              whatsapp={detailData.whatsapp || []}
              calls={detailData.calls || []}
              matches={detailData.matches || []}
              jds={detailData.jds || []}
              statusBreakdown={summary?.status_breakdown}
              feedbackBreakdown={summary?.feedback_breakdown}
            />
          )}

          {activeTab === 'analysis' && hasActiveFilters && !detailData.users && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-300">Loading data for filters...</p>
            </div>
          )}

          {activeTab === 'cohorts' && hasRequiredData && (
            <CohortBuilder
              users={filteredUsers}
              whatsapp={detailData.whatsapp || []}
              calls={detailData.calls || []}
              matches={detailData.matches || []}
            />
          )}
        </div>

        {selectedUser && (
          <UserModal
            user={selectedUser}
            whatsapp={detailData.whatsapp || []}
            calls={detailData.calls || []}
            matches={detailData.matches || []}
            jds={detailData.jds || []}
            onClose={() => setSelectedUser(null)}
          />
        )}

        {loading && !summary && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 text-center">
              <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-300">Loading dashboard...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
