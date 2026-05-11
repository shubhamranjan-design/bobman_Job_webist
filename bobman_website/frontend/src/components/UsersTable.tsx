import { useState } from 'react';
import type { User, WhatsAppMessage, Call } from '../types';

interface UsersTableProps {
  users: User[];
  whatsapp: WhatsAppMessage[];
  calls: Call[];
  onUserClick: (user: User) => void;
}

const PAGE_SIZE = 24;

interface UserWithStats extends User {
  waOut: number;
  waIn: number;
  waTotal: number;
  waStatus: string;
  callTotal: number;
  callSuccess: number;
  callDuration: number;
}

export function UsersTable({ users, whatsapp, calls, onUserClick }: UsersTableProps) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'profile' | 'wa' | 'calls'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Calculate stats for each user
  const usersWithStats: UserWithStats[] = users.map((user) => {
    const userMessages = whatsapp.filter(
      (m) => m.user_id === user.id || m.phone_number?.replace('+', '') === user.phone_number?.replace('+', '')
    );
    const userCalls = calls.filter(
      (c) => c.user_id === user.id || c.external_number?.replace('+', '') === user.phone_number?.replace('+', '')
    );

    const waOut = userMessages.filter(m => m.direction === 'outbound').length;
    const waIn = userMessages.filter(m => m.direction === 'inbound').length;

    // Determine WA status
    let waStatus = 'none';
    const hasFailedMsg = userMessages.some(m =>
      ['failed', 'error', 'undelivered'].includes((m.status || '').toLowerCase())
    );
    if (userMessages.length > 0) {
      waStatus = hasFailedMsg ? 'failed' : 'connected';
    }

    return {
      ...user,
      waOut,
      waIn,
      waTotal: userMessages.length,
      waStatus,
      callTotal: userCalls.length,
      callSuccess: userCalls.filter(c => c.status === 'done').length,
      callDuration: userCalls.reduce((sum, c) => sum + (c.call_duration_secs || 0), 0),
    };
  });

  // Filter
  const filtered = usersWithStats.filter((u) => {
    const searchLower = search.toLowerCase();
    return (
      !search ||
      u.name?.toLowerCase().includes(searchLower) ||
      u.phone_number?.includes(search) ||
      u.email?.toLowerCase().includes(searchLower)
    );
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';

    switch (sortBy) {
      case 'name':
        aVal = a.name || '';
        bVal = b.name || '';
        break;
      case 'created_at':
        aVal = new Date(a.created_at).getTime();
        bVal = new Date(b.created_at).getTime();
        break;
      case 'profile':
        aVal = a.profile_completion_per || 0;
        bVal = b.profile_completion_per || 0;
        break;
      case 'wa':
        aVal = a.waTotal;
        bVal = b.waTotal;
        break;
      case 'calls':
        aVal = a.callTotal;
        bVal = b.callTotal;
        break;
    }

    if (sortDir === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const paginatedUsers = sorted.slice(startIdx, startIdx + PAGE_SIZE);

  const handleSearch = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
  };

  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    return `${mins}m`;
  };

  const getWAStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'failed':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="🔍 Search users..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500"
        />

        {/* View Toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'grid' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
            }`}
          >
            ▦ Grid
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'list' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
            }`}
          >
            ☰ List
          </button>
        </div>

        {/* Sort */}
        <select
          value={`${sortBy}-${sortDir}`}
          onChange={(e) => {
            const [field, dir] = e.target.value.split('-') as [typeof sortBy, typeof sortDir];
            setSortBy(field);
            setSortDir(dir);
          }}
          className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 outline-none"
        >
          <option value="created_at-desc">Newest First</option>
          <option value="created_at-asc">Oldest First</option>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
          <option value="profile-desc">Profile High</option>
          <option value="profile-asc">Profile Low</option>
          <option value="wa-desc">Most WA</option>
          <option value="calls-desc">Most Calls</option>
        </select>

        <span className="text-sm text-slate-500 dark:text-slate-400">
          {sorted.length} users
        </span>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {paginatedUsers.map((user) => (
            <div
              key={user.id}
              onClick={() => onUserClick(user)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {user.name || 'Unknown'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{user.phone_number}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getWAStatusBadge(user.waStatus)}`}>
                  {user.waStatus === 'connected' ? '✓ WA' : user.waStatus === 'failed' ? '✗ WA' : '○'}
                </span>
              </div>

              {/* Profile Progress */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                  <span>Profile</span>
                  <span>{user.profile_completion_per || 0}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${
                      (user.profile_completion_per || 0) >= 80
                        ? 'bg-green-500'
                        : (user.profile_completion_per || 0) >= 50
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${user.profile_completion_per || 0}%` }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="text-center p-1.5 bg-white dark:bg-slate-800 rounded-lg">
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{user.waTotal}</div>
                  <div className="text-[9px] text-slate-500 dark:text-slate-400">💬 WA</div>
                </div>
                <div className="text-center p-1.5 bg-white dark:bg-slate-800 rounded-lg">
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{user.callTotal}</div>
                  <div className="text-[9px] text-slate-500 dark:text-slate-400">📞 Calls</div>
                </div>
                <div className="text-center p-1.5 bg-white dark:bg-slate-800 rounded-lg">
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{formatDuration(user.callDuration)}</div>
                  <div className="text-[9px] text-slate-500 dark:text-slate-400">⏱ Dur</div>
                </div>
              </div>

              {/* WA breakdown */}
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                <span>📤 {user.waOut}</span>
                <span>📥 {user.waIn}</span>
                <span>✓ {user.callSuccess} success</span>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {formatDate(user.created_at)}
                </span>
                {user.jobs_interested_count > 0 && (
                  <span className="px-2 py-0.5 bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400 rounded-full text-[10px] font-medium">
                    💼 {user.jobs_interested_count}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Phone</th>
                <th className="px-3 py-2 text-center">Profile</th>
                <th className="px-3 py-2 text-center">WA Out</th>
                <th className="px-3 py-2 text-center">WA In</th>
                <th className="px-3 py-2 text-center">Calls</th>
                <th className="px-3 py-2 text-center">Duration</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {paginatedUsers.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => onUserClick(user)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{user.name || 'Unknown'}</div>
                    <div className="text-xs text-slate-500">{user.email || '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{user.phone_number}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      (user.profile_completion_per || 0) >= 80
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : (user.profile_completion_per || 0) >= 50
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {user.profile_completion_per || 0}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">{user.waOut}</td>
                  <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">{user.waIn}</td>
                  <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">{user.callTotal}</td>
                  <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">{formatDuration(user.callDuration)}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{formatDate(user.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length === 0 && (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400">No users found</div>
      )}

      {/* Pagination */}
      {sorted.length > 0 && (
        <div className="p-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Showing {startIdx + 1}-{Math.min(startIdx + PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2.5 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⟨⟨
            </button>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-2.5 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⟨
            </button>
            <span className="px-3 py-1 text-sm text-slate-700 dark:text-slate-300">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⟩
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
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
