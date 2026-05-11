import { useState } from 'react';
import type { User, Match, JD } from '../types';

interface MatchesTableProps {
  allUsers: User[];      // All users for lookup (to display names)
  filteredUsers: User[]; // Filtered users (to filter matches)
  matches: Match[];
  jds: JD[];
}

const PAGE_SIZE = 20;

function formatDate(dateStr: string) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
  });
}

export function MatchesTable({ allUsers, filteredUsers, matches, jds }: MatchesTableProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [scoreFilter, setScoreFilter] = useState<string>('all');

  // Create lookup maps - use allUsers for lookups to always display user info
  const userMap = new Map(allUsers.map((u) => [u.id, u]));
  const jdMap = new Map(jds.map((j) => [j.id, j]));

  // Create set of filtered user IDs for filtering matches
  const filteredUserIds = new Set(filteredUsers.map((u) => u.id));

  // Enrich matches with user and JD data, filter to show only matches for filtered users
  const enrichedMatches = matches
    .filter((match) => filteredUserIds.has(match.candidate_id))
    .map((match) => ({
      ...match,
      user: userMap.get(match.candidate_id),
      jd: jdMap.get(match.jd_id),
    }));

  // Filter
  const filtered = enrichedMatches.filter(match => {
    if (scoreFilter !== 'all') {
      const score = match.matching_score || 0;
      if (scoreFilter === 'high' && score < 80) return false;
      if (scoreFilter === 'medium' && (score < 60 || score >= 80)) return false;
      if (scoreFilter === 'low' && score >= 60) return false;
    }
    if (search) {
      const searchLower = search.toLowerCase();
      const userName = match.user?.name?.toLowerCase() || '';
      const phone = match.user?.phone_number || '';
      const role = match.jd?.role_name?.toLowerCase() || '';
      const code = match.jd?.role_code?.toLowerCase() || '';
      if (!userName.includes(searchLower) && !phone.includes(search) &&
          !role.includes(searchLower) && !code.includes(searchLower)) {
        return false;
      }
    }
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'score') {
      return sortDir === 'desc'
        ? (b.matching_score || 0) - (a.matching_score || 0)
        : (a.matching_score || 0) - (b.matching_score || 0);
    }
    const aDate = new Date(a.matched_at).getTime();
    const bDate = new Date(b.matched_at).getTime();
    return sortDir === 'desc' ? bDate - aDate : aDate - bDate;
  });

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const paginatedData = sorted.slice(startIdx, startIdx + PAGE_SIZE);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (score >= 60) return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400';
    if (score >= 40) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'border-green-500';
    if (score >= 60) return 'border-cyan-500';
    if (score >= 40) return 'border-amber-500';
    return 'border-red-500';
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="🔍 Search by candidate, role, code..."
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

        {/* Score Filter */}
        <select
          value={scoreFilter}
          onChange={(e) => { setScoreFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
        >
          <option value="all">All Scores</option>
          <option value="high">High (80%+)</option>
          <option value="medium">Medium (60-79%)</option>
          <option value="low">Low (&lt;60%)</option>
        </select>

        {/* Sort */}
        <select
          value={`${sortBy}-${sortDir}`}
          onChange={(e) => {
            const [field, dir] = e.target.value.split('-');
            setSortBy(field as 'score' | 'date');
            setSortDir(dir as 'desc' | 'asc');
          }}
          className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
        >
          <option value="score-desc">Highest Score</option>
          <option value="score-asc">Lowest Score</option>
          <option value="date-desc">Newest First</option>
          <option value="date-asc">Oldest First</option>
        </select>

        <span className="text-sm text-slate-500">{sorted.length} matches</span>
      </div>

      {/* Cards View */}
      {viewMode === 'cards' && (
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[70vh] overflow-y-auto">
          {paginatedData.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-500">
              <span className="text-4xl mb-2">🔗</span>
              <p>No matches found</p>
            </div>
          ) : (
            paginatedData.map((match) => (
              <div
                key={match.id}
                className={`bg-slate-50 dark:bg-slate-900 border-l-4 ${getScoreBg(match.matching_score)} border border-slate-200 dark:border-slate-700 rounded-xl p-3`}
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {match.user?.name || 'Unknown'}
                    </h3>
                    <p className="text-xs text-slate-500">{match.user?.phone_number || 'N/A'}</p>
                  </div>
                  <div className={`px-3 py-1.5 rounded-lg text-xl font-bold ${getScoreColor(match.matching_score)}`}>
                    {match.matching_score}%
                  </div>
                </div>

                {/* JD Info */}
                <div className="bg-white dark:bg-slate-800 rounded-lg p-2 mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                      {match.jd?.role_code || 'N/A'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {match.jd?.role_name || 'Unknown Role'}
                  </p>
                  {match.jd?.company_name && (
                    <p className="text-xs text-slate-500">{match.jd.company_name}</p>
                  )}
                </div>

                {/* Score Breakdown */}
                {(match.skills_score || match.experience_score) && (
                  <div className="flex gap-2 mb-2">
                    {match.skills_score && (
                      <div className="flex-1 text-center p-1.5 bg-white dark:bg-slate-800 rounded-lg">
                        <div className="text-sm font-bold text-blue-600">{match.skills_score}%</div>
                        <div className="text-[9px] text-slate-500">Skills</div>
                      </div>
                    )}
                    {match.experience_score && (
                      <div className="flex-1 text-center p-1.5 bg-white dark:bg-slate-800 rounded-lg">
                        <div className="text-sm font-bold text-purple-600">{match.experience_score}%</div>
                        <div className="text-[9px] text-slate-500">Experience</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500">{formatDate(match.matched_at)}</span>
                  {match.jd?.location && (
                    <span className="text-[10px] text-slate-500">📍 {match.jd.location}</span>
                  )}
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
                <th className="px-3 py-2 text-left">Candidate</th>
                <th className="px-3 py-2 text-left">Phone</th>
                <th className="px-3 py-2 text-left">JD Code</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-center">Score</th>
                <th className="px-3 py-2 text-center">Skills</th>
                <th className="px-3 py-2 text-center">Exp</th>
                <th className="px-3 py-2 text-left">Matched</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {paginatedData.map((match) => (
                <tr key={match.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                    {match.user?.name || 'Unknown'}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                    {match.user?.phone_number || '-'}
                  </td>
                  <td className="px-3 py-2 font-mono text-blue-600 dark:text-blue-400">
                    {match.jd?.role_code || match.jd_id}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                    {match.jd?.role_name || '-'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getScoreColor(match.matching_score)}`}>
                      {match.matching_score}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-blue-600">
                    {match.skills_score ? `${match.skills_score}%` : '-'}
                  </td>
                  <td className="px-3 py-2 text-center text-purple-600">
                    {match.experience_score ? `${match.experience_score}%` : '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{formatDate(match.matched_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div className="p-8 text-center text-slate-500">No matches found</div>
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
