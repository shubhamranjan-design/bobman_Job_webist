import { useState, useRef } from 'react';
import type { User, Call } from '../types';

interface CallsTableProps {
  users: User[];
  calls: Call[];
}

const PAGE_SIZE = 20;

// ElevenLabs API key - should be moved to env variable in production
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || 'REPLACE_WITH_YOUR_ELEVENLABS_KEY';

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CallsTable({ users, calls }: CallsTableProps) {
  const [viewMode, setViewMode] = useState<'users' | 'calls'>('calls');
  const [sortBy, setSortBy] = useState<'date' | 'duration'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Audio state
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [audioLoading, setAudioLoading] = useState<Record<string, boolean>>({});
  const [audioPlaying, setAudioPlaying] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  // Transcript state
  const [fetchedTranscripts, setFetchedTranscripts] = useState<Record<string, string>>({});
  const [transcriptLoading, setTranscriptLoading] = useState<Record<string, boolean>>({});

  // Fetch audio from ElevenLabs
  const fetchAudio = async (conversationId: string, callId: string) => {
    if (audioUrls[callId] || audioLoading[callId]) return;

    setAudioLoading(prev => ({ ...prev, [callId]: true }));
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
        { headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
      );
      if (!response.ok) throw new Error('Failed to fetch audio');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrls(prev => ({ ...prev, [callId]: url }));
    } catch (error) {
      console.error('Error fetching audio:', error);
    } finally {
      setAudioLoading(prev => ({ ...prev, [callId]: false }));
    }
  };

  // Play/pause audio
  const toggleAudio = async (call: Call) => {
    const audio = audioRefs.current[call.id];

    if (!audioUrls[call.id] && call.elevenlabs_conversation_id) {
      await fetchAudio(call.elevenlabs_conversation_id, call.id);
      return;
    }

    if (audio) {
      if (audio.paused) {
        // Pause all other audios
        Object.values(audioRefs.current).forEach(a => a?.pause());
        audio.play();
        setAudioPlaying(call.id);
      } else {
        audio.pause();
        setAudioPlaying(null);
      }
    }
  };

  // Fetch transcript from ElevenLabs
  const fetchTranscript = async (conversationId: string, callId: string) => {
    if (fetchedTranscripts[callId] || transcriptLoading[callId]) return;

    setTranscriptLoading(prev => ({ ...prev, [callId]: true }));
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
        { headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
      );
      if (!response.ok) throw new Error('Failed to fetch transcript');
      const data = await response.json();

      if (data.transcript && data.transcript.length > 0) {
        const formattedTranscript = data.transcript.map((t: any) => {
          const role = t.role === 'agent' ? '🤖 Agent' : '👤 User';
          const time = t.time_in_call_secs
            ? `${Math.floor(t.time_in_call_secs / 60)}m ${Math.floor(t.time_in_call_secs % 60)}s`
            : '';
          return `${role}${time ? ` (${time})` : ''}: ${t.message || ''}`;
        }).join('\n\n');
        setFetchedTranscripts(prev => ({ ...prev, [callId]: formattedTranscript }));
      } else {
        setFetchedTranscripts(prev => ({ ...prev, [callId]: 'No transcript available' }));
      }
    } catch (error) {
      console.error('Error fetching transcript:', error);
      setFetchedTranscripts(prev => ({ ...prev, [callId]: 'Failed to load transcript' }));
    } finally {
      setTranscriptLoading(prev => ({ ...prev, [callId]: false }));
    }
  };

  // Create user map
  const userMap = new Map(users.map(u => [u.id, u]));
  const phoneToUser = new Map(users.map(u => [u.phone_number?.replace('+', ''), u]));

  // Enrich calls with user data
  const enrichedCalls = calls.map(call => {
    const user = userMap.get(call.user_id) ||
                 phoneToUser.get(call.external_number?.replace('+', ''));
    return { ...call, user };
  });

  // Filter calls
  const filteredCalls = enrichedCalls.filter(call => {
    if (statusFilter !== 'all' && call.status !== statusFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      const userName = call.user?.name?.toLowerCase() || '';
      const phone = call.external_number || '';
      if (!userName.includes(searchLower) && !phone.includes(search)) return false;
    }
    return true;
  });

  // Sort calls
  const sortedCalls = [...filteredCalls].sort((a, b) => {
    if (sortBy === 'date') {
      const aDate = new Date(a.created_at).getTime();
      const bDate = new Date(b.created_at).getTime();
      return sortDir === 'desc' ? bDate - aDate : aDate - bDate;
    } else {
      const aDur = a.call_duration_secs || 0;
      const bDur = b.call_duration_secs || 0;
      return sortDir === 'desc' ? bDur - aDur : aDur - bDur;
    }
  });

  // Calculate stats by user
  const userStats = users
    .map((user) => {
      const userCalls = calls.filter(
        (c) => c.user_id === user.id ||
          c.external_number?.replace('+', '') === user.phone_number?.replace('+', '')
      );
      if (userCalls.length === 0) return null;

      return {
        user,
        total: userCalls.length,
        successful: userCalls.filter(c => c.status === 'done').length,
        noAnswer: userCalls.filter(c => c.status === 'no-answer' || c.status === 'initiated').length,
        failed: userCalls.filter(c => !['done', 'no-answer', 'initiated'].includes(c.status)).length,
        totalDuration: userCalls.reduce((sum, c) => sum + (c.call_duration_secs || 0), 0),
        lastCall: userCalls.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]?.created_at || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.totalDuration || 0) - (a?.totalDuration || 0));

  // Pagination
  const dataToPage = viewMode === 'calls' ? sortedCalls : userStats;
  const totalPages = Math.ceil(dataToPage.length / PAGE_SIZE);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const paginatedData = dataToPage.slice(startIdx, startIdx + PAGE_SIZE);

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    const styles: Record<string, string> = {
      done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      'no-answer': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      initiated: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return styles[s] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
  };

  const getStatusIcon = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'done') return '✓';
    if (s === 'no-answer') return '✗';
    if (s === 'initiated') return '⏳';
    return '?';
  };

  // Get unique statuses
  const statuses = [...new Set(calls.map(c => c.status))].filter(Boolean);

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="🔍 Search by name or phone..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          className="flex-1 min-w-[200px] px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:border-blue-500"
        />

        {/* View Toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => { setViewMode('calls'); setCurrentPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'calls' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''
            }`}
          >
            📞 All Calls
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

        {viewMode === 'calls' && (
          <>
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
            >
              <option value="all">All Status</option>
              {statuses.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Sort */}
            <select
              value={`${sortBy}-${sortDir}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split('-');
                setSortBy(field as 'date' | 'duration');
                setSortDir(dir as 'desc' | 'asc');
              }}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="duration-desc">Longest First</option>
              <option value="duration-asc">Shortest First</option>
            </select>
          </>
        )}

        <span className="text-sm text-slate-500">
          {viewMode === 'calls' ? `${sortedCalls.length} calls` : `${userStats.length} users`}
        </span>
      </div>

      {/* All Calls View */}
      {viewMode === 'calls' && (
        <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          {paginatedData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <span className="text-4xl mb-2">📞</span>
              <p>No calls found</p>
            </div>
          ) : (
            (paginatedData as typeof enrichedCalls).map((call) => (
              <div
                key={call.id}
                className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                <div
                  className="p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                        call.status === 'done' ? 'bg-green-100 dark:bg-green-900/30 text-green-600' :
                        call.status === 'no-answer' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' :
                        'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                      }`}>
                        {getStatusIcon(call.status)}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {call.user?.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-slate-500">{call.external_number}</div>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(call.status)}`}>
                          {call.status}
                        </span>
                        <div className="text-xs text-slate-500 mt-1">{formatDate(call.created_at)}</div>
                      </div>
                      <div className="text-center px-3 py-1 bg-white dark:bg-slate-800 rounded-lg">
                        <div className="text-lg font-bold text-cyan-600 dark:text-cyan-400">
                          {formatDuration(call.call_duration_secs || 0)}
                        </div>
                        <div className="text-[9px] text-slate-500">Duration</div>
                      </div>
                      {(call.transcript || call.call_transcript) && (
                        <span className="text-blue-500">📝</span>
                      )}
                      <span className="text-slate-400">{expandedCall === call.id ? '▼' : '▶'}</span>
                    </div>
                  </div>
                  {call.outcome && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 ml-13">
                      <strong>Outcome:</strong> {call.outcome}
                    </p>
                  )}
                </div>

                {/* Expanded Transcript */}
                {expandedCall === call.id && (
                  <div className="px-3 pb-3 border-t border-slate-200 dark:border-slate-700">
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                      <div className="p-2 bg-white dark:bg-slate-800 rounded-lg text-center">
                        <div className="text-xs text-slate-500">Stage</div>
                        <div className="font-medium">{call.call_stage ?? 'N/A'}</div>
                      </div>
                      <div className="p-2 bg-white dark:bg-slate-800 rounded-lg text-center">
                        <div className="text-xs text-slate-500">Started</div>
                        <div className="font-medium text-sm">{formatDate(call.created_at)}</div>
                      </div>
                      <div className="p-2 bg-white dark:bg-slate-800 rounded-lg text-center">
                        <div className="text-xs text-slate-500">Ended</div>
                        <div className="font-medium text-sm">{formatDate(call.ended_at || null)}</div>
                      </div>
                      <div className="p-2 bg-white dark:bg-slate-800 rounded-lg text-center">
                        <div className="text-xs text-slate-500">Reason</div>
                        <div className="font-medium text-sm truncate">{call.reason || 'N/A'}</div>
                      </div>
                    </div>

                    {/* Audio Player */}
                    {call.elevenlabs_conversation_id && (
                      <div className="p-3 bg-white dark:bg-slate-800 rounded-lg mb-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleAudio(call); }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              audioLoading[call.id]
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                                : audioPlaying === call.id
                                  ? 'bg-red-500 text-white'
                                  : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                            disabled={audioLoading[call.id]}
                          >
                            {audioLoading[call.id] ? '⏳ Loading...' : audioPlaying === call.id ? '⏸️ Pause' : '🎵 Play Audio'}
                          </button>
                          <audio
                            ref={(el) => { audioRefs.current[call.id] = el; }}
                            src={audioUrls[call.id] || ''}
                            onEnded={() => setAudioPlaying(null)}
                            onPlay={() => setAudioPlaying(call.id)}
                            onPause={() => audioPlaying === call.id && setAudioPlaying(null)}
                            controls
                            className={`flex-1 h-10 ${audioUrls[call.id] ? '' : 'hidden'}`}
                          />
                          {!audioUrls[call.id] && !audioLoading[call.id] && (
                            <span className="text-xs text-slate-500">Click play to load audio recording</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Transcript Section */}
                    {(() => {
                      const localTranscript = call.transcript || call.call_transcript;
                      const elevenlabsTranscript = fetchedTranscripts[call.id];
                      const hasConversationId = call.elevenlabs_conversation_id;

                      if (localTranscript) {
                        return (
                          <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-2">
                              <span>📝</span> Transcript
                            </h4>
                            <div className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-64 overflow-y-auto">
                              {localTranscript}
                            </div>
                          </div>
                        );
                      } else if (elevenlabsTranscript) {
                        return (
                          <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-2">
                              <span>📝</span> Transcript (from ElevenLabs)
                            </h4>
                            <div className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-64 overflow-y-auto">
                              {elevenlabsTranscript}
                            </div>
                          </div>
                        );
                      } else if (hasConversationId) {
                        return (
                          <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchTranscript(call.elevenlabs_conversation_id!, call.id);
                              }}
                              disabled={transcriptLoading[call.id]}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                transcriptLoading[call.id]
                                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                                  : 'bg-purple-500 text-white hover:bg-purple-600'
                              }`}
                            >
                              {transcriptLoading[call.id] ? '⏳ Loading transcript...' : '📝 Load Transcript from ElevenLabs'}
                            </button>
                          </div>
                        );
                      } else {
                        return (
                          <div className="p-4 bg-white dark:bg-slate-800 rounded-lg text-center text-slate-500">
                            No transcript available
                          </div>
                        );
                      }
                    })()}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* By User View */}
      {viewMode === 'users' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Phone</th>
                <th className="px-3 py-2 text-center">Total</th>
                <th className="px-3 py-2 text-center">✓ Done</th>
                <th className="px-3 py-2 text-center">✗ No Answer</th>
                <th className="px-3 py-2 text-center">Duration</th>
                <th className="px-3 py-2 text-left">Last Call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {(paginatedData as NonNullable<typeof userStats[0]>[]).map((stat) => (
                <tr key={stat.user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                    {stat.user.name || 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                    {stat.user.phone_number}
                  </td>
                  <td className="px-3 py-2 text-center font-bold">{stat.total}</td>
                  <td className="px-3 py-2 text-center text-green-600">{stat.successful}</td>
                  <td className="px-3 py-2 text-center text-red-600">{stat.noAnswer}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 rounded-full text-xs font-medium">
                      {formatDuration(stat.totalDuration)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{formatDate(stat.lastCall)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {userStats.length === 0 && (
            <div className="p-8 text-center text-slate-500">No calls found</div>
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
