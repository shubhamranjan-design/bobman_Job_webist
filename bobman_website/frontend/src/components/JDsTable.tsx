import { useState } from 'react';
import type { JD, Match } from '../types';

interface JDsTableProps {
  jds: JD[];
  matches: Match[];
}

const PAGE_SIZE = 20;

export function JDsTable({ jds, matches }: JDsTableProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortBy, setSortBy] = useState<'code' | 'matches' | 'date'>('matches');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedJD, setExpandedJD] = useState<string | null>(null);

  // Calculate matches per JD
  const jdsWithStats = jds.map((jd) => {
    const jdMatches = matches.filter((m) => m.jd_id === jd.id);
    const avgScore = jdMatches.length > 0
      ? jdMatches.reduce((sum, m) => sum + (m.matching_score || 0), 0) / jdMatches.length
      : 0;
    return {
      ...jd,
      matchCount: jdMatches.length,
      avgScore,
    };
  });

  // Filter
  const filtered = jdsWithStats.filter((jd) => {
    if (statusFilter && jd.status !== statusFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      const code = jd.role_code?.toLowerCase() || '';
      const role = jd.role_name?.toLowerCase() || '';
      const company = jd.company_name?.toLowerCase() || '';
      if (!code.includes(searchLower) && !role.includes(searchLower) && !company.includes(searchLower)) {
        return false;
      }
    }
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'matches') {
      return sortDir === 'desc' ? b.matchCount - a.matchCount : a.matchCount - b.matchCount;
    }
    if (sortBy === 'date') {
      const aDate = new Date(a.created_at || 0).getTime();
      const bDate = new Date(b.created_at || 0).getTime();
      return sortDir === 'desc' ? bDate - aDate : aDate - bDate;
    }
    const aVal = a.role_code || '';
    const bVal = b.role_code || '';
    return sortDir === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
  });

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const paginatedData = sorted.slice(startIdx, startIdx + PAGE_SIZE);

  // Get unique statuses
  const statuses = [...new Set(jds.map((j) => j.status).filter(Boolean))];

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'active') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (s === 'closed') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (s === 'on-hold') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="🔍 Search JDs by code, role, company..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
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

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
        >
          <option value="">All Status</option>
          {statuses.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={`${sortBy}-${sortDir}`}
          onChange={(e) => {
            const [field, dir] = e.target.value.split('-');
            setSortBy(field as typeof sortBy);
            setSortDir(dir as typeof sortDir);
          }}
          className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
        >
          <option value="matches-desc">Most Matches</option>
          <option value="matches-asc">Least Matches</option>
          <option value="date-desc">Newest First</option>
          <option value="date-asc">Oldest First</option>
          <option value="code-asc">Code A-Z</option>
          <option value="code-desc">Code Z-A</option>
        </select>

        <span className="text-sm text-slate-500">{sorted.length} JDs</span>
      </div>

      {/* Cards View */}
      {viewMode === 'cards' && (
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[70vh] overflow-y-auto">
          {paginatedData.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-500">
              <span className="text-4xl mb-2">📋</span>
              <p>No JDs found</p>
            </div>
          ) : (
            paginatedData.map((jd) => (
              <div
                key={jd.id}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
              >
                <div
                  className="p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => setExpandedJD(expandedJD === jd.id ? null : jd.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                          {jd.role_code}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadge(jd.status)}`}>
                          {jd.status}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {jd.role_name || 'Unknown Role'}
                      </h3>
                      {jd.company_name && (
                        <p className="text-xs text-slate-500">{jd.company_name}</p>
                      )}
                    </div>
                    <div className="text-center px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg ml-2">
                      <div className="text-lg font-bold text-blue-600">{jd.matchCount}</div>
                      <div className="text-[9px] text-slate-500">Matches</div>
                    </div>
                  </div>

                  {/* Quick Info */}
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    {jd.location && (
                      <span className="flex items-center gap-1">
                        📍 {jd.location}
                      </span>
                    )}
                    {jd.experience_required && (
                      <span className="flex items-center gap-1">
                        💼 {jd.experience_required}
                      </span>
                    )}
                    {(jd.positions || jd.no_of_positions) && (
                      <span className="flex items-center gap-1">
                        👥 {jd.positions || jd.no_of_positions} pos
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedJD === jd.id && (
                  <div className="px-3 pb-3 border-t border-slate-200 dark:border-slate-700">
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="p-2 bg-white dark:bg-slate-800 rounded-lg">
                        <div className="text-xs text-slate-500">Salary</div>
                        <div className="font-medium text-green-600">{jd.salary_range || 'N/A'}</div>
                      </div>
                      <div className="p-2 bg-white dark:bg-slate-800 rounded-lg">
                        <div className="text-xs text-slate-500">Avg Match Score</div>
                        <div className="font-medium text-blue-600">{jd.avgScore.toFixed(0)}%</div>
                      </div>
                      {jd.experience_range && (
                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg col-span-2">
                          <div className="text-xs text-slate-500">Experience Range</div>
                          <div className="font-medium">{jd.experience_range}</div>
                        </div>
                      )}
                      {jd.brief_context && (
                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg col-span-2">
                          <div className="text-xs text-slate-500">Description</div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-3">
                            {jd.brief_context}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left">Location</th>
                <th className="px-3 py-2 text-left">Experience</th>
                <th className="px-3 py-2 text-left">Salary</th>
                <th className="px-3 py-2 text-center">Positions</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-center">Matches</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {paginatedData.map((jd) => (
                <tr key={jd.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-3 py-2 font-mono font-medium text-blue-600 dark:text-blue-400">
                    {jd.role_code || '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-200 max-w-[200px] truncate">
                    {jd.role_name || '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                    {jd.company_name || '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                    {jd.location || '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                    {jd.experience_required || '-'}
                  </td>
                  <td className="px-3 py-2 text-green-600 dark:text-green-400">
                    {jd.salary_range || '-'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {jd.positions || jd.no_of_positions || '-'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(jd.status)}`}>
                      {jd.status || 'unknown'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center font-bold text-blue-600">{jd.matchCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div className="p-8 text-center text-slate-500">No JDs found</div>
          )}
        </div>
      )}

      {/* Pagination */}
      {sorted.length > 0 && (
        <div className="p-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
          <span className="text-sm text-slate-500">
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
              {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-2.5 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⟩
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
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
