import { useMemo, useState } from 'react';
import type { User, WhatsAppMessage, Call, Match, JD } from '../types';

interface InterestedTableProps {
  users: User[];
  whatsapp: WhatsAppMessage[];
  calls: Call[];
  matches: Match[];
  jds: JD[];
  onUserClick: (user: User) => void;
}

type SortField = 'name' | 'jobs_interested_count' | 'profile_completion_per' | 'created_at' | 'status';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;

export function InterestedTable({ users, whatsapp, calls, matches, jds, onUserClick }: InterestedTableProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortField, setSortField] = useState<SortField>('jobs_interested_count');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // Filter only interested users (jobs_interested_count > 0) and apply search
  const interestedUsers = useMemo(() => {
    return users.filter(u => {
      if ((u.jobs_interested_count || 0) <= 0) return false;
      if (search) {
        const searchLower = search.toLowerCase();
        const name = u.name?.toLowerCase() || '';
        const phone = u.phone_number || '';
        const email = u.email?.toLowerCase() || '';
        if (!name.includes(searchLower) && !phone.includes(search) && !email.includes(searchLower)) {
          return false;
        }
      }
      return true;
    });
  }, [users, search]);

  // Create JD map for lookup
  const jdMap = useMemo(() => new Map(jds.map(j => [j.id, j])), [jds]);

  // Enrich users with additional data
  const enrichedUsers = useMemo(() => {
    return interestedUsers.map(user => {
      const userMatches = matches.filter(m => m.candidate_id === user.id);
      const userCalls = calls.filter(c =>
        c.user_id === user.id ||
        c.external_number?.replace('+', '') === user.phone_number?.replace('+', '')
      );
      const userWA = whatsapp.filter(w =>
        w.user_id === user.id ||
        w.phone_number?.replace('+', '') === user.phone_number?.replace('+', '')
      );

      const matchedJDs = userMatches.map(m => jdMap.get(m.jd_id)).filter(Boolean);
      const avgMatchScore = userMatches.length > 0
        ? userMatches.reduce((sum, m) => sum + (m.matching_score || 0), 0) / userMatches.length
        : 0;

      return {
        ...user,
        matchCount: userMatches.length,
        avgMatchScore,
        matchedJDs,
        callCount: userCalls.length,
        successfulCalls: userCalls.filter(c => c.status === 'done').length,
        waCount: userWA.length,
        waInbound: userWA.filter(w => w.direction === 'inbound').length,
        waOutbound: userWA.filter(w => w.direction === 'outbound').length,
      };
    });
  }, [interestedUsers, matches, calls, whatsapp, jdMap]);

  // Sort users
  const sortedUsers = useMemo(() => {
    return [...enrichedUsers].sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case 'name':
          aVal = a.name || '';
          bVal = b.name || '';
          break;
        case 'jobs_interested_count':
          aVal = a.jobs_interested_count || 0;
          bVal = b.jobs_interested_count || 0;
          break;
        case 'profile_completion_per':
          aVal = a.profile_completion_per || 0;
          bVal = b.profile_completion_per || 0;
          break;
        case 'created_at':
          aVal = a.created_at || '';
          bVal = b.created_at || '';
          break;
        case 'status':
          aVal = a.status || '';
          bVal = b.status || '';
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [enrichedUsers, sortField, sortDir]);

  // Paginate
  const totalPages = Math.ceil(sortedUsers.length / PAGE_SIZE);
  const startIdx = (page - 1) * PAGE_SIZE;
  const paginatedUsers = sortedUsers.slice(startIdx, startIdx + PAGE_SIZE);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600 dark:text-green-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'active') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (s === 'pending') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="🔍 Search by name, phone, email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[200px] px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:border-blue-500"
        />

        {/* View Toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'cards' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
            }`}
          >
            ▦ Cards
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'table' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
            }`}
          >
            ☰ Table
          </button>
        </div>

        {/* Sort */}
        <select
          value={`${sortField}-${sortDir}`}
          onChange={(e) => {
            const [field, dir] = e.target.value.split('-');
            setSortField(field as SortField);
            setSortDir(dir as SortDir);
          }}
          className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
        >
          <option value="jobs_interested_count-desc">Most Interested</option>
          <option value="jobs_interested_count-asc">Least Interested</option>
          <option value="profile_completion_per-desc">Highest Profile %</option>
          <option value="profile_completion_per-asc">Lowest Profile %</option>
          <option value="created_at-desc">Newest First</option>
          <option value="created_at-asc">Oldest First</option>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
        </select>

        <span className="text-sm text-slate-500">{sortedUsers.length} interested users</span>
      </div>

      {/* Cards View */}
      {viewMode === 'cards' && (
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[70vh] overflow-y-auto">
          {paginatedUsers.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-500">
              <span className="text-4xl mb-2">❤️</span>
              <p>No interested users found</p>
            </div>
          ) : (
            paginatedUsers.map((user) => (
              <div
                key={user.id}
                onClick={() => onUserClick(user)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {user.name || 'Unknown'}
                    </h3>
                    <p className="text-xs text-slate-500">{user.phone_number || user.email || 'N/A'}</p>
                  </div>
                  <span className="px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-bold">
                    ❤️ {user.jobs_interested_count || 0}
                  </span>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="text-sm font-bold text-blue-600">{user.matchCount}</div>
                    <div className="text-[9px] text-slate-500">Matches</div>
                  </div>
                  <div className="text-center p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <div className={`text-sm font-bold ${getScoreColor(user.avgMatchScore)}`}>
                      {user.avgMatchScore > 0 ? `${user.avgMatchScore.toFixed(0)}%` : '-'}
                    </div>
                    <div className="text-[9px] text-slate-500">Avg Score</div>
                  </div>
                  <div className="text-center p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="text-sm font-bold text-amber-600">{user.successfulCalls}/{user.callCount}</div>
                    <div className="text-[9px] text-slate-500">Calls</div>
                  </div>
                </div>

                {/* WA Stats */}
                <div className="flex items-center gap-2 mb-3 text-xs">
                  <span className="text-slate-500">💬</span>
                  <span className="text-green-600">{user.waInbound} in</span>
                  <span className="text-slate-400">/</span>
                  <span className="text-blue-600">{user.waOutbound} out</span>
                </div>

                {/* Profile Progress */}
                <div className="mb-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-500">Profile</span>
                    <span className="text-xs font-medium">{user.profile_completion_per || 0}%</span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        (user.profile_completion_per || 0) >= 70 ? 'bg-green-500' :
                        (user.profile_completion_per || 0) >= 40 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${user.profile_completion_per || 0}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(user.status)}`}>
                    {user.status || '-'}
                  </span>
                  <span className="text-[10px] text-slate-500">{formatDate(user.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-center">Interested</th>
                <th className="px-3 py-2 text-center">Matches</th>
                <th className="px-3 py-2 text-center">Avg Score</th>
                <th className="px-3 py-2 text-center">Calls</th>
                <th className="px-3 py-2 text-center">WhatsApp</th>
                <th className="px-3 py-2 text-center">Profile</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    No interested users found
                  </td>
                </tr>
              ) : (
                paginatedUsers.map(user => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                    onClick={() => onUserClick(user)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{user.name || '-'}</div>
                      <div className="text-xs text-slate-500">{user.phone_number || user.email || '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                        {user.jobs_interested_count || 0}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-blue-600">{user.matchCount}</td>
                    <td className="px-3 py-2 text-center">
                      {user.avgMatchScore > 0 ? (
                        <span className={getScoreColor(user.avgMatchScore)}>
                          {user.avgMatchScore.toFixed(0)}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-center text-amber-600">
                      {user.successfulCalls}/{user.callCount}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-green-600">{user.waInbound}↓</span>
                      {' / '}
                      <span className="text-blue-600">{user.waOutbound}↑</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              (user.profile_completion_per || 0) >= 70 ? 'bg-green-500' :
                              (user.profile_completion_per || 0) >= 40 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${user.profile_completion_per || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{user.profile_completion_per || 0}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(user.status)}`}>
                        {user.status || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{formatDate(user.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {sortedUsers.length > 0 && (
        <div className="p-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
          <span className="text-sm text-slate-500">
            Showing {startIdx + 1}-{Math.min(startIdx + PAGE_SIZE, sortedUsers.length)} of {sortedUsers.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2.5 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⟨⟨
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⟨
            </button>
            <span className="px-3 py-1 text-sm text-slate-700 dark:text-slate-300">
              {page} / {totalPages || 1}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="px-2.5 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⟩
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages || totalPages === 0}
              className="px-2.5 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⟩⟩
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
