import { useState } from 'react';
import type { User, WhatsAppMessage } from '../types';

interface WhatsAppTableProps {
  users: User[];
  whatsapp: WhatsAppMessage[];
}

const PAGE_SIZE = 20;

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WhatsAppTable({ users, whatsapp }: WhatsAppTableProps) {
  const [viewMode, setViewMode] = useState<'messages' | 'users'>('messages');
  const [sortBy, setSortBy] = useState<'date' | 'total'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<string>('all');

  // Create user map
  const userMap = new Map(users.map(u => [u.id, u]));
  const phoneToUser = new Map(users.map(u => [u.phone_number?.replace('+', ''), u]));

  // Enrich messages with user data
  const enrichedMessages = whatsapp.map(msg => {
    const user = userMap.get(msg.user_id) ||
                 phoneToUser.get(msg.phone_number?.replace('+', ''));
    return { ...msg, user };
  });

  // Filter messages
  const filteredMessages = enrichedMessages.filter(msg => {
    if (directionFilter !== 'all' && msg.direction !== directionFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      const userName = msg.user?.name?.toLowerCase() || '';
      const phone = msg.phone_number || '';
      const text = msg.message_text?.toLowerCase() || '';
      if (!userName.includes(searchLower) && !phone.includes(search) && !text.includes(searchLower)) {
        return false;
      }
    }
    return true;
  });

  // Sort messages
  const sortedMessages = [...filteredMessages].sort((a, b) => {
    const aDate = new Date(a.created_at).getTime();
    const bDate = new Date(b.created_at).getTime();
    return sortDir === 'desc' ? bDate - aDate : aDate - bDate;
  });

  // Calculate stats by user
  const userStats = users
    .map((user) => {
      const userMessages = whatsapp.filter(
        (m) => m.user_id === user.id ||
          m.phone_number?.replace('+', '') === user.phone_number?.replace('+', '')
      );
      if (userMessages.length === 0) return null;

      const outbound = userMessages.filter(m => m.direction === 'outbound').length;
      const inbound = userMessages.filter(m => m.direction === 'inbound').length;
      const sorted = [...userMessages].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const lastStatus = sorted[0]?.status || '';
      const hasFailed = userMessages.some(m =>
        ['failed', 'error', 'undelivered'].includes((m.status || '').toLowerCase())
      );

      return {
        user,
        total: userMessages.length,
        outbound,
        inbound,
        lastMessage: sorted[0]?.created_at || null,
        lastStatus,
        hasFailed,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (sortBy === 'total') {
        return sortDir === 'desc' ? (b?.total || 0) - (a?.total || 0) : (a?.total || 0) - (b?.total || 0);
      }
      const aDate = new Date(a?.lastMessage || 0).getTime();
      const bDate = new Date(b?.lastMessage || 0).getTime();
      return sortDir === 'desc' ? bDate - aDate : aDate - bDate;
    });

  // Pagination
  const dataToPage = viewMode === 'messages' ? sortedMessages : userStats;
  const totalPages = Math.ceil(dataToPage.length / PAGE_SIZE);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const paginatedData = dataToPage.slice(startIdx, startIdx + PAGE_SIZE);

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    const styles: Record<string, string> = {
      sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      read: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      received: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      undelivered: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return styles[s] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="🔍 Search messages, users, phones..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          className="flex-1 min-w-[200px] px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:border-blue-500"
        />

        {/* View Toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => { setViewMode('messages'); setCurrentPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'messages' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
            }`}
          >
            💬 All Messages
          </button>
          <button
            onClick={() => { setViewMode('users'); setCurrentPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'users' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
            }`}
          >
            👥 By User
          </button>
        </div>

        {viewMode === 'messages' && (
          <>
            {/* Direction Filter */}
            <select
              value={directionFilter}
              onChange={(e) => { setDirectionFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
            >
              <option value="all">All Direction</option>
              <option value="outbound">📤 Outbound</option>
              <option value="inbound">📥 Inbound</option>
            </select>

            {/* Sort */}
            <select
              value={`${sortBy}-${sortDir}`}
              onChange={(e) => {
                const [, dir] = e.target.value.split('-');
                setSortDir(dir as 'desc' | 'asc');
              }}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
            </select>
          </>
        )}

        {viewMode === 'users' && (
          <select
            value={`${sortBy}-${sortDir}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split('-');
              setSortBy(field as 'date' | 'total');
              setSortDir(dir as 'desc' | 'asc');
            }}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
          >
            <option value="date-desc">Recent First</option>
            <option value="total-desc">Most Messages</option>
            <option value="total-asc">Least Messages</option>
          </select>
        )}

        <span className="text-sm text-slate-500">
          {viewMode === 'messages' ? `${sortedMessages.length} messages` : `${userStats.length} users`}
        </span>
      </div>

      {/* All Messages View */}
      {viewMode === 'messages' && (
        <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          {paginatedData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <span className="text-4xl mb-2">💬</span>
              <p>No messages found</p>
            </div>
          ) : (
            (paginatedData as typeof enrichedMessages).map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] ${msg.direction === 'outbound' ? 'order-2' : ''}`}>
                  {/* User info */}
                  <div className={`flex items-center gap-2 mb-1 text-xs text-slate-500 ${msg.direction === 'outbound' ? 'justify-end' : ''}`}>
                    <span className="font-medium">{msg.user?.name || 'Unknown'}</span>
                    <span>•</span>
                    <span>{msg.phone_number}</span>
                  </div>
                  {/* Message bubble */}
                  <div
                    className={`p-3 rounded-2xl ${
                      msg.direction === 'outbound'
                        ? 'bg-blue-500 text-white rounded-br-md'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.message_text || '(empty message)'}</p>
                    <div className={`flex items-center gap-2 mt-1.5 ${msg.direction === 'outbound' ? 'justify-end' : ''}`}>
                      <span className={`text-[10px] ${msg.direction === 'outbound' ? 'opacity-70' : 'text-slate-500'}`}>
                        {formatDate(msg.created_at)}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        msg.direction === 'outbound' ? 'bg-white/20' : getStatusBadge(msg.status)
                      }`}>
                        {msg.status || 'sent'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* By User View */}
      {viewMode === 'users' && (
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[70vh] overflow-y-auto">
          {paginatedData.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-500">
              <span className="text-4xl mb-2">💬</span>
              <p>No users with messages</p>
            </div>
          ) : (
            (paginatedData as NonNullable<typeof userStats[0]>[]).map((stat) => (
              <div
                key={stat.user.id}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3"
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {stat.user.name || 'Unknown'}
                    </h3>
                    <p className="text-xs text-slate-500">{stat.user.phone_number}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    stat.hasFailed
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}>
                    {stat.hasFailed ? '✗ Failed' : '✓ OK'}
                  </span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{stat.total}</div>
                    <div className="text-[9px] text-slate-500">Total</div>
                  </div>
                  <div className="text-center p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="text-lg font-bold text-blue-600">{stat.outbound}</div>
                    <div className="text-[9px] text-slate-500">📤 Out</div>
                  </div>
                  <div className="text-center p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="text-lg font-bold text-green-600">{stat.inbound}</div>
                    <div className="text-[9px] text-slate-500">📥 In</div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500">{formatDate(stat.lastMessage)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadge(stat.lastStatus)}`}>
                    {stat.lastStatus || 'unknown'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      {dataToPage.length > 0 && (
        <div className="p-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
          <span className="text-sm text-slate-500">
            Showing {startIdx + 1}-{Math.min(startIdx + PAGE_SIZE, dataToPage.length)} of {dataToPage.length}
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
