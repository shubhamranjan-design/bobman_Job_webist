import { useEffect, useState, useRef } from 'react';
import type { User, WhatsAppMessage, Call, Match, JD } from '../types';

// ElevenLabs API key
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || 'REPLACE_WITH_YOUR_ELEVENLABS_KEY';

interface UserModalProps {
  user: User | null;
  whatsapp: WhatsAppMessage[];
  calls: Call[];
  matches: Match[];
  jds: JD[];
  onClose: () => void;
}

function formatDate(dateStr: string | undefined | null) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(dateStr: string | undefined | null) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

export function UserModal({ user, whatsapp, calls, matches, jds, onClose }: UserModalProps) {
  const [activeSection, setActiveSection] = useState<'profile' | 'whatsapp' | 'calls' | 'matches'>('profile');
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

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

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!user) return null;

  const userMessages = whatsapp
    .filter(
      (m) =>
        m.user_id === user.id ||
        m.phone_number?.replace('+', '') === user.phone_number?.replace('+', '')
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const userCalls = calls
    .filter(
      (c) =>
        c.user_id === user.id ||
        c.external_number?.replace('+', '') === user.phone_number?.replace('+', '')
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const userMatches = matches
    .filter((m) => m.candidate_id === user.id)
    .sort((a, b) => (b.matching_score || 0) - (a.matching_score || 0));

  const jdMap = new Map(jds.map((j) => [j.id, j]));

  // Calculate stats
  const waOut = userMessages.filter(m => m.direction === 'outbound').length;
  const waIn = userMessages.filter(m => m.direction === 'inbound').length;
  const successfulCalls = userCalls.filter(c => c.status === 'done').length;
  const totalCallDuration = userCalls.reduce((sum, c) => sum + (c.call_duration_secs || 0), 0);

  const getStatusBadge = (status: string) => {
    const statusLower = (status || '').toLowerCase();
    const classes: Record<string, string> = {
      sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      received: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
      read: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      initiated: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      'no-answer': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return classes[statusLower] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤', count: null },
    { id: 'whatsapp', label: 'WhatsApp', icon: '💬', count: userMessages.length },
    { id: 'calls', label: 'Calls', icon: '📞', count: userCalls.length },
    { id: 'matches', label: 'Matches', icon: '🔗', count: userMatches.length },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-bold">
                {(user.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {user.name || 'Unknown User'}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{user.phone_number}</p>
              </div>
            </div>
            {/* Quick Stats */}
            <div className="flex gap-4 mt-3">
              <div className="text-center px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg">
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{userMessages.length}</div>
                <div className="text-[10px] text-slate-500">💬 Messages</div>
              </div>
              <div className="text-center px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg">
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{userCalls.length}</div>
                <div className="text-[10px] text-slate-500">📞 Calls</div>
              </div>
              <div className="text-center px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg">
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{userMatches.length}</div>
                <div className="text-[10px] text-slate-500">🔗 Matches</div>
              </div>
              <div className="text-center px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg">
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{formatDuration(totalCallDuration)}</div>
                <div className="text-[10px] text-slate-500">⏱ Talk Time</div>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as typeof activeSection)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeSection === tab.id
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeSection === tab.id ? 'bg-white/20' : 'bg-slate-300 dark:bg-slate-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeSection === 'profile' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Info */}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Basic Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Email</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{user.email || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Status</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(user.status)}`}>
                      {user.status || 'unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Company</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{user.company || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Created</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{formatDate(user.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Profile Completion */}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Profile Progress</h3>
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative w-20 h-20">
                    <svg className="w-20 h-20 transform -rotate-90">
                      <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="none" className="text-slate-200 dark:text-slate-700" />
                      <circle
                        cx="40" cy="40" r="36"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${(user.profile_completion_per || 0) * 2.26} 226`}
                        className={`${(user.profile_completion_per || 0) >= 80 ? 'text-green-500' : (user.profile_completion_per || 0) >= 50 ? 'text-amber-500' : 'text-red-500'}`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-800 dark:text-slate-200">
                      {user.profile_completion_per || 0}%
                    </span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Jobs Interested</span>
                      <span className="font-medium text-pink-600">{user.jobs_interested_count || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Jobs Presented</span>
                      <span className="font-medium text-blue-600">{user.jobs_presented_count || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Total Matches</span>
                      <span className="font-medium text-cyan-600">{user.cumulative_matches_count || 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Communication Stats */}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Communication</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">{waOut}</div>
                    <div className="text-xs text-slate-500">📤 WA Sent</div>
                  </div>
                  <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">{waIn}</div>
                    <div className="text-xs text-slate-500">📥 WA Received</div>
                  </div>
                  <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">{successfulCalls}</div>
                    <div className="text-xs text-slate-500">✓ Success Calls</div>
                  </div>
                  <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">{formatDuration(totalCallDuration)}</div>
                    <div className="text-xs text-slate-500">⏱ Total Duration</div>
                  </div>
                </div>
              </div>

              {/* Links */}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Links</h3>
                <div className="space-y-2">
                  {user.linkedin_url && (
                    <a
                      href={user.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <span>🔗</span>
                      <span className="text-sm truncate">{user.linkedin_url}</span>
                    </a>
                  )}
                  {user.cv_file_url && (
                    <a
                      href={user.cv_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <span>📄</span>
                      <span className="text-sm">View CV</span>
                    </a>
                  )}
                  {!user.linkedin_url && !user.cv_file_url && (
                    <p className="text-sm text-slate-500 text-center py-2">No links available</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'whatsapp' && (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {userMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <span className="text-4xl mb-2">💬</span>
                  <p>No WhatsApp messages</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {userMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] p-3 rounded-2xl ${
                          msg.direction === 'outbound'
                            ? 'bg-blue-500 text-white rounded-br-md'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.message_text || '(empty message)'}</p>
                        <div className="flex items-center gap-2 mt-1.5 justify-end">
                          <span className={`text-[10px] ${msg.direction === 'outbound' ? 'opacity-70' : 'text-slate-500'}`}>
                            {formatDateShort(msg.created_at)}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            msg.direction === 'outbound' ? 'bg-white/20' : getStatusBadge(msg.status)
                          }`}>
                            {msg.status || 'sent'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === 'calls' && (
            <div className="space-y-3">
              {userCalls.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <span className="text-4xl mb-2">📞</span>
                  <p>No calls recorded</p>
                </div>
              ) : (
                userCalls.map((call) => (
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
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            call.status === 'done' ? 'bg-green-100 dark:bg-green-900/30' :
                            call.status === 'no-answer' ? 'bg-red-100 dark:bg-red-900/30' :
                            'bg-amber-100 dark:bg-amber-900/30'
                          }`}>
                            <span className="text-lg">
                              {call.status === 'done' ? '✓' : call.status === 'no-answer' ? '✗' : '⏳'}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(call.status)}`}>
                                {call.status}
                              </span>
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                {formatDuration(call.call_duration_secs || 0)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{formatDate(call.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {call.elevenlabs_conversation_id && (
                            <span className="text-xs text-blue-500">🎵 Audio</span>
                          )}
                          {(call.transcript || call.call_transcript) && (
                            <span className="text-xs text-purple-500">📝 Transcript</span>
                          )}
                          <span className="text-slate-400">{expandedCall === call.id ? '▼' : '▶'}</span>
                        </div>
                      </div>
                      {call.outcome && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 pl-13">
                          <strong>Outcome:</strong> {call.outcome}
                        </p>
                      )}
                    </div>
                    {expandedCall === call.id && (
                      <div className="px-3 pb-3 border-t border-slate-200 dark:border-slate-700">
                        {/* Audio Player */}
                        {call.elevenlabs_conversation_id && (
                          <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg">
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
                                {audioLoading[call.id] ? '⏳ Loading...' : audioPlaying === call.id ? '⏸️ Pause' : '🎵 Play'}
                              </button>
                              <audio
                                ref={(el) => { audioRefs.current[call.id] = el; }}
                                src={audioUrls[call.id] || ''}
                                onEnded={() => setAudioPlaying(null)}
                                onPlay={() => setAudioPlaying(call.id)}
                                onPause={() => audioPlaying === call.id && setAudioPlaying(null)}
                                controls
                                className={`flex-1 h-8 ${audioUrls[call.id] ? '' : 'hidden'}`}
                              />
                            </div>
                          </div>
                        )}

                        {/* Transcript */}
                        {(() => {
                          const localTranscript = call.transcript || call.call_transcript;
                          const elevenlabsTranscript = fetchedTranscripts[call.id];

                          if (localTranscript) {
                            return (
                              <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg">
                                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">📝 Transcript</h4>
                                <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-64 overflow-y-auto">
                                  {localTranscript}
                                </p>
                              </div>
                            );
                          } else if (elevenlabsTranscript) {
                            return (
                              <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg">
                                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">📝 Transcript</h4>
                                <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-64 overflow-y-auto">
                                  {elevenlabsTranscript}
                                </p>
                              </div>
                            );
                          } else if (call.elevenlabs_conversation_id) {
                            return (
                              <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg">
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
                                  {transcriptLoading[call.id] ? '⏳ Loading...' : '📝 Load Transcript'}
                                </button>
                              </div>
                            );
                          } else {
                            return (
                              <div className="mt-3 p-4 bg-white dark:bg-slate-800 rounded-lg text-center text-slate-500">
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

          {activeSection === 'matches' && (
            <div className="space-y-3">
              {userMatches.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <span className="text-4xl mb-2">🔗</span>
                  <p>No job matches</p>
                </div>
              ) : (
                userMatches.map((match) => {
                  const jd = jdMap.get(match.jd_id);
                  return (
                    <div
                      key={match.id}
                      className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                            {jd?.role_name || 'Unknown Role'}
                          </h4>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {jd?.role_code} • {jd?.company_name || 'Company N/A'} • {jd?.location || 'Remote'}
                          </p>
                          {jd?.salary_range && (
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">💰 {jd.salary_range}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <span
                            className={`px-3 py-1.5 rounded-lg text-lg font-bold ${
                              (match.matching_score || 0) >= 80
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : (match.matching_score || 0) >= 60
                                ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}
                          >
                            {match.matching_score}%
                          </span>
                          <p className="text-xs text-slate-500 mt-1">{formatDateShort(match.matched_at)}</p>
                        </div>
                      </div>
                      {(match.skills_score || match.experience_score) && (
                        <div className="flex gap-4 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                          {match.skills_score && (
                            <div className="text-sm">
                              <span className="text-slate-500">Skills:</span>
                              <span className="ml-1 font-medium text-blue-600">{match.skills_score}%</span>
                            </div>
                          )}
                          {match.experience_score && (
                            <div className="text-sm">
                              <span className="text-slate-500">Experience:</span>
                              <span className="ml-1 font-medium text-purple-600">{match.experience_score}%</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
