import { useMemo, useState } from 'react';
import type { User, WhatsAppMessage, Call, Match } from '../types';

interface CohortBuilderProps {
  users: User[];
  whatsapp: WhatsAppMessage[];
  calls: Call[];
  matches: Match[];
}

interface CohortFilter {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface SavedCohort {
  name: string;
  filters: CohortFilter[];
}

export function CohortBuilder({ users, whatsapp, calls, matches }: CohortBuilderProps) {
  const [cohortFilters, setCohortFilters] = useState<CohortFilter[]>([]);
  const [cohortName, setCohortName] = useState('');
  const [savedCohorts, setSavedCohorts] = useState<SavedCohort[]>([]);
  const [compareCohorts, setCompareCohorts] = useState<string[]>([]);

  // Build user metrics map
  const userMetricsMap = useMemo(() => {
    const map = new Map<string, {
      callStats: { total: number; duration: number; successful: number };
      waStats: { total: number; outbound: number; inbound: number };
      matchCount: number;
    }>();

    users.forEach(u => {
      map.set(u.id, {
        callStats: { total: 0, duration: 0, successful: 0 },
        waStats: { total: 0, outbound: 0, inbound: 0 },
        matchCount: 0,
      });
    });

    calls.forEach(c => {
      if (c.user_id && map.has(c.user_id)) {
        const m = map.get(c.user_id)!;
        m.callStats.total++;
        m.callStats.duration += c.call_duration_secs || 0;
        if (c.status === 'done') m.callStats.successful++;
      }
    });

    whatsapp.forEach(w => {
      if (w.user_id && map.has(w.user_id)) {
        const m = map.get(w.user_id)!;
        m.waStats.total++;
        if (w.direction === 'outbound') m.waStats.outbound++;
        if (w.direction === 'inbound') m.waStats.inbound++;
      }
    });

    matches.forEach(m => {
      if (m.candidate_id && map.has(m.candidate_id)) {
        map.get(m.candidate_id)!.matchCount++;
      }
    });

    return map;
  }, [users, calls, whatsapp, matches]);

  // Get filtered users for current cohort being built
  const previewUsers = useMemo(() => {
    if (cohortFilters.length === 0) return [];

    return users.filter(user => {
      const userStats = userMetricsMap.get(user.id);

      return cohortFilters.every(filter => {
        let value: any;

        switch (filter.field) {
          case 'profile_completion_per':
            value = user.profile_completion_per || 0;
            break;
          case 'jobs_interested_count':
            value = user.jobs_interested_count || 0;
            break;
          case 'status':
            value = user.status || '';
            break;
          case 'recruiter_feedback_status':
            value = user.recruiter_feedback_status || '';
            break;
          case 'has_cv':
            value = (user.linkedin_cv_text || user.file_cv_text || user.cv_file_url) ? 1 : 0;
            break;
          case 'call_count':
            value = userStats?.callStats.total || 0;
            break;
          case 'call_duration':
            value = userStats?.callStats.duration || 0;
            break;
          case 'successful_calls':
            value = userStats?.callStats.successful || 0;
            break;
          case 'wa_count':
            value = userStats?.waStats.total || 0;
            break;
          case 'wa_inbound':
            value = userStats?.waStats.inbound || 0;
            break;
          case 'wa_outbound':
            value = userStats?.waStats.outbound || 0;
            break;
          case 'match_count':
            value = userStats?.matchCount || 0;
            break;
          default:
            value = (user as any)[filter.field];
        }

        const targetValue = ['status', 'recruiter_feedback_status'].includes(filter.field)
          ? filter.value
          : parseFloat(filter.value);

        switch (filter.operator) {
          case 'eq': return value === targetValue;
          case 'neq': return value !== targetValue;
          case 'gt': return value > targetValue;
          case 'gte': return value >= targetValue;
          case 'lt': return value < targetValue;
          case 'lte': return value <= targetValue;
          case 'contains': return String(value).toLowerCase().includes(String(targetValue).toLowerCase());
          default: return true;
        }
      });
    });
  }, [users, cohortFilters, userMetricsMap]);

  // Calculate metrics for a set of users
  const calculateMetrics = (filteredUsers: User[]) => {
    let totalCalls = 0;
    let totalDuration = 0;
    let successfulCalls = 0;
    let totalWA = 0;
    let waOut = 0;
    let waIn = 0;
    let withCV = 0;
    let withInterest = 0;
    let withMatches = 0;
    let connectedUsers = 0;
    let usersGte4min = 0;
    let prof70plus = 0;

    filteredUsers.forEach(u => {
      const stats = userMetricsMap.get(u.id);
      if (stats) {
        totalCalls += stats.callStats.total;
        totalDuration += stats.callStats.duration;
        successfulCalls += stats.callStats.successful;
        totalWA += stats.waStats.total;
        waOut += stats.waStats.outbound;
        waIn += stats.waStats.inbound;
        if (stats.callStats.duration > 0) connectedUsers++;
        if (stats.callStats.duration >= 240) usersGte4min++;
        if (stats.matchCount > 0) withMatches++;
      }
      if (u.linkedin_cv_text || u.file_cv_text || u.cv_file_url) withCV++;
      if ((u.jobs_interested_count || 0) > 0) withInterest++;
      if ((u.profile_completion_per || 0) >= 70) prof70plus++;
    });

    return {
      users: filteredUsers.length,
      totalCalls,
      totalDuration,
      successfulCalls,
      connectedUsers,
      usersGte4min,
      totalWA,
      waOut,
      waIn,
      withCV,
      withInterest,
      withMatches,
      prof70plus,
      avgDurPerUser: filteredUsers.length > 0 ? Math.round(totalDuration / filteredUsers.length) : 0,
      avgDurPerConnected: connectedUsers > 0 ? Math.round(totalDuration / connectedUsers) : 0,
    };
  };

  // Cohort comparison results
  const cohortResults = useMemo(() => {
    return compareCohorts.map(cohortName => {
      const cohort = savedCohorts.find(c => c.name === cohortName);
      if (!cohort) return null;

      const filteredUsers = users.filter(user => {
        const userStats = userMetricsMap.get(user.id);

        return cohort.filters.every(filter => {
          let value: any;

          switch (filter.field) {
            case 'profile_completion_per':
              value = user.profile_completion_per || 0;
              break;
            case 'jobs_interested_count':
              value = user.jobs_interested_count || 0;
              break;
            case 'status':
              value = user.status || '';
              break;
            case 'recruiter_feedback_status':
              value = user.recruiter_feedback_status || '';
              break;
            case 'has_cv':
              value = (user.linkedin_cv_text || user.file_cv_text || user.cv_file_url) ? 1 : 0;
              break;
            case 'call_count':
              value = userStats?.callStats.total || 0;
              break;
            case 'call_duration':
              value = userStats?.callStats.duration || 0;
              break;
            case 'successful_calls':
              value = userStats?.callStats.successful || 0;
              break;
            case 'wa_count':
              value = userStats?.waStats.total || 0;
              break;
            case 'wa_inbound':
              value = userStats?.waStats.inbound || 0;
              break;
            case 'wa_outbound':
              value = userStats?.waStats.outbound || 0;
              break;
            case 'match_count':
              value = userStats?.matchCount || 0;
              break;
            default:
              value = (user as any)[filter.field];
          }

          const targetValue = ['status', 'recruiter_feedback_status'].includes(filter.field)
            ? filter.value
            : parseFloat(filter.value);

          switch (filter.operator) {
            case 'eq': return value === targetValue;
            case 'neq': return value !== targetValue;
            case 'gt': return value > targetValue;
            case 'gte': return value >= targetValue;
            case 'lt': return value < targetValue;
            case 'lte': return value <= targetValue;
            case 'contains': return String(value).toLowerCase().includes(String(targetValue).toLowerCase());
            default: return true;
          }
        });
      });

      return { name: cohortName, metrics: calculateMetrics(filteredUsers) };
    }).filter(Boolean);
  }, [compareCohorts, savedCohorts, users, userMetricsMap]);

  const formatDuration = (secs: number): string => {
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  const addCohortFilter = () => {
    setCohortFilters([...cohortFilters, {
      id: Date.now().toString(),
      field: 'profile_completion_per',
      operator: 'gte',
      value: '0',
    }]);
  };

  const removeCohortFilter = (id: string) => {
    setCohortFilters(cohortFilters.filter(f => f.id !== id));
  };

  const updateCohortFilter = (id: string, updates: Partial<CohortFilter>) => {
    setCohortFilters(cohortFilters.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const saveCohort = () => {
    if (!cohortName.trim() || cohortFilters.length === 0) return;
    setSavedCohorts([...savedCohorts, { name: cohortName, filters: [...cohortFilters] }]);
    setCohortName('');
    setCohortFilters([]);
  };

  const deleteCohort = (name: string) => {
    setSavedCohorts(savedCohorts.filter(c => c.name !== name));
    setCompareCohorts(compareCohorts.filter(c => c !== name));
  };

  const toggleCohortCompare = (name: string) => {
    if (compareCohorts.includes(name)) {
      setCompareCohorts(compareCohorts.filter(c => c !== name));
    } else {
      setCompareCohorts([...compareCohorts, name]);
    }
  };

  const fieldOptions = [
    { value: 'profile_completion_per', label: 'Profile %' },
    { value: 'jobs_interested_count', label: 'Jobs Interested' },
    { value: 'status', label: 'Status' },
    { value: 'recruiter_feedback_status', label: 'Recruiter Feedback Status' },
    { value: 'has_cv', label: 'Has CV (0/1)' },
    { value: 'call_count', label: 'Call Count' },
    { value: 'call_duration', label: 'Call Duration (sec)' },
    { value: 'successful_calls', label: 'Successful Calls' },
    { value: 'wa_count', label: 'WA Message Count' },
    { value: 'wa_inbound', label: 'WA Inbound Count' },
    { value: 'wa_outbound', label: 'WA Outbound Count' },
    { value: 'match_count', label: 'Match Count' },
  ];

  const operatorOptions = [
    { value: 'eq', label: '=' },
    { value: 'neq', label: '!=' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '>=' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '<=' },
    { value: 'contains', label: 'contains' },
  ];

  const previewMetrics = cohortFilters.length > 0 ? calculateMetrics(previewUsers) : null;

  return (
    <div className="space-y-4">
      {/* Cohort Builder */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-lg">Create New Cohort</h3>
          <p className="text-sm text-slate-500 mt-1">Define custom user segments based on any combination of metrics</p>
        </div>

        <div className="p-4 space-y-4">
          {/* Filter Builder */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Cohort Filters</label>
              <button
                onClick={addCohortFilter}
                className="text-sm px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                + Add Filter
              </button>
            </div>

            {cohortFilters.length === 0 && (
              <div className="text-center py-8 text-slate-500 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                Click "Add Filter" to start building your cohort
              </div>
            )}

            {cohortFilters.map((filter) => (
              <div key={filter.id} className="flex gap-2 items-center bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg">
                <select
                  value={filter.field}
                  onChange={(e) => updateCohortFilter(filter.id, { field: e.target.value })}
                  className="flex-1 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2"
                >
                  {fieldOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={filter.operator}
                  onChange={(e) => updateCohortFilter(filter.id, { operator: e.target.value })}
                  className="w-24 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2"
                >
                  {operatorOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={filter.value}
                  onChange={(e) => updateCohortFilter(filter.id, { value: e.target.value })}
                  className="w-32 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2"
                  placeholder="Value"
                />
                <button
                  onClick={() => removeCohortFilter(filter.id)}
                  className="text-red-500 hover:text-red-700 p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                >
                  X
                </button>
              </div>
            ))}

            {/* Preview */}
            {previewMetrics && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">Preview: {previewMetrics.users} users match</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-slate-500">Calls:</span> <span className="font-medium">{previewMetrics.totalCalls}</span></div>
                  <div><span className="text-slate-500">Duration:</span> <span className="font-medium">{formatDuration(previewMetrics.totalDuration)}</span></div>
                  <div><span className="text-slate-500">Connected:</span> <span className="font-medium">{previewMetrics.connectedUsers}</span></div>
                  <div><span className="text-slate-500">WA:</span> <span className="font-medium">{previewMetrics.totalWA}</span></div>
                  <div><span className="text-slate-500">With CV:</span> <span className="font-medium">{previewMetrics.withCV}</span></div>
                  <div><span className="text-slate-500">Interested:</span> <span className="font-medium">{previewMetrics.withInterest}</span></div>
                  <div><span className="text-slate-500">Matches:</span> <span className="font-medium">{previewMetrics.withMatches}</span></div>
                  <div><span className="text-slate-500">70%+ Profile:</span> <span className="font-medium">{previewMetrics.prof70plus}</span></div>
                </div>
              </div>
            )}

            {/* Save Cohort */}
            {cohortFilters.length > 0 && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <input
                  type="text"
                  value={cohortName}
                  onChange={(e) => setCohortName(e.target.value)}
                  className="flex-1 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-2"
                  placeholder="Enter cohort name..."
                />
                <button
                  onClick={saveCohort}
                  disabled={!cohortName.trim()}
                  className="text-sm px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Cohort
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Saved Cohorts */}
      {savedCohorts.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">Saved Cohorts ({savedCohorts.length})</h3>
          </div>

          <div className="p-4 space-y-3">
            {savedCohorts.map((cohort) => (
              <div
                key={cohort.name}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  compareCohorts.includes(cohort.name)
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30'
                }`}
              >
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-300">{cohort.name}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {cohort.filters.map(f => {
                      const field = fieldOptions.find(o => o.value === f.field)?.label || f.field;
                      const op = operatorOptions.find(o => o.value === f.operator)?.label || f.operator;
                      return `${field} ${op} ${f.value}`;
                    }).join(' AND ')}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleCohortCompare(cohort.name)}
                    className={`text-sm px-3 py-1.5 rounded-lg ${
                      compareCohorts.includes(cohort.name)
                        ? 'bg-purple-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'
                    }`}
                  >
                    {compareCohorts.includes(cohort.name) ? 'Comparing' : 'Compare'}
                  </button>
                  <button
                    onClick={() => deleteCohort(cohort.name)}
                    className="text-sm px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cohort Comparison Results */}
      {cohortResults.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">Cohort Comparison</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300">Cohort</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">Users</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">Calls</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">Tot Dur</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">Avg/User</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">Connected</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">&gt;=4min</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">WA Total</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">WA Out</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">WA In</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">Match</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">Interest</th>
                  <th className="text-right p-3 font-medium text-slate-600 dark:text-slate-300">CV</th>
                </tr>
              </thead>
              <tbody>
                {cohortResults.map((result: any, idx) => (
                  <tr key={idx} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="p-3 font-medium text-purple-600 dark:text-purple-400">{result.name}</td>
                    <td className="p-3 text-right text-blue-600 font-medium">{result.metrics.users}</td>
                    <td className="p-3 text-right">{result.metrics.totalCalls}</td>
                    <td className="p-3 text-right">{formatDuration(result.metrics.totalDuration)}</td>
                    <td className="p-3 text-right text-amber-600">{formatDuration(result.metrics.avgDurPerUser)}</td>
                    <td className="p-3 text-right text-green-600">{result.metrics.connectedUsers}</td>
                    <td className="p-3 text-right text-emerald-600">{result.metrics.usersGte4min}</td>
                    <td className="p-3 text-right">{result.metrics.totalWA}</td>
                    <td className="p-3 text-right text-cyan-600">{result.metrics.waOut}</td>
                    <td className="p-3 text-right text-teal-600">{result.metrics.waIn}</td>
                    <td className="p-3 text-right text-purple-600">{result.metrics.withMatches}</td>
                    <td className="p-3 text-right text-pink-600">{result.metrics.withInterest}</td>
                    <td className="p-3 text-right">{result.metrics.withCV}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">How to use Cohort Builder</h4>
        <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
          <li>Click "Add Filter" to define conditions for your cohort</li>
          <li>Combine multiple filters to narrow down your user segment</li>
          <li>Preview shows matching users and their metrics</li>
          <li>Name and save your cohort for later comparison</li>
          <li>Click "Compare" on multiple cohorts to see side-by-side metrics</li>
        </ol>
      </div>
    </div>
  );
}
