import React, { useState, useEffect, useRef } from 'react';
import MultiSelect from './MultiSelect';
import DataTable from './DataTable';
import FeedbackUpdater, { getFeedbackOptions } from './FeedbackUpdater';
import CommentsEditor from './CommentsEditor';
import { fetchUserFilterOptions, fetchUsersList, searchUser, searchByRole, API_BASE } from '../utils/api';

// Flag detection patterns
const FLAG_PATTERNS = {
  red: {
    keywords: ['not interested', 'no thanks', 'don\'t call', 'stop calling', 'unsubscribe', 'remove me', 'don\'t contact', 'not looking', 'already have', 'fake', 'scam', 'fraud', 'spam', 'block', 'report', 'harassment', 'legal action', 'complaint', 'worst', 'terrible', 'horrible', 'angry', 'furious', 'never'],
    statuses: ['failed', 'error', 'rejected', 'blocked', 'undelivered', 'bounced']
  },
  yellow: {
    keywords: ['maybe', 'later', 'busy', 'call back', 'not now', 'think about', 'let me check', 'get back', 'unsure', 'confused', 'don\'t understand', 'explain', 'what is', 'who is', 'why', 'how does', 'clarify', 'wait', 'hold on', 'one moment'],
    statuses: ['pending', 'queued', 'processing', 'sent', 'unknown']
  },
  green: {
    keywords: ['yes', 'interested', 'tell me more', 'send details', 'apply', 'want to', 'looking for', 'perfect', 'great', 'excellent', 'love', 'amazing', 'thank you', 'thanks', 'helpful', 'good', 'sounds good', 'i\'m in', 'sign me up', 'confirm', 'accept', 'agree', 'proceed', 'go ahead'],
    statuses: ['delivered', 'read', 'success', 'completed', 'confirmed', 'accepted']
  }
};

const detectFlag = (text, status) => {
  if (!text && !status) return null;
  const lowerText = (text || '').toLowerCase();
  const lowerStatus = (status || '').toLowerCase();
  for (const keyword of FLAG_PATTERNS.red.keywords) { if (lowerText.includes(keyword)) return 'red'; }
  if (FLAG_PATTERNS.red.statuses.some(s => lowerStatus.includes(s))) return 'red';
  for (const keyword of FLAG_PATTERNS.green.keywords) { if (lowerText.includes(keyword)) return 'green'; }
  if (FLAG_PATTERNS.green.statuses.some(s => lowerStatus.includes(s))) return 'green';
  for (const keyword of FLAG_PATTERNS.yellow.keywords) { if (lowerText.includes(keyword)) return 'yellow'; }
  if (FLAG_PATTERNS.yellow.statuses.some(s => lowerStatus.includes(s))) return 'yellow';
  return null;
};

const getFlagStyle = (flag) => {
  if (flag === 'red') return { borderLeft: '4px solid #e94560', background: '#fff5f5' };
  if (flag === 'yellow') return { borderLeft: '4px solid #f39c12', background: '#fffbeb' };
  if (flag === 'green') return { borderLeft: '4px solid #00b894', background: '#f0fff4' };
  return {};
};

const getFlagIcon = (flag) => {
  if (flag === 'red') return <span title="Red Flag - Negative" style={{ color: '#e94560', marginRight: '5px' }}>&#128681;</span>;
  if (flag === 'yellow') return <span title="Yellow Flag - Caution" style={{ color: '#f39c12', marginRight: '5px' }}>&#9888;&#65039;</span>;
  if (flag === 'green') return <span title="Green Flag - Positive" style={{ color: '#00b894', marginRight: '5px' }}>&#9989;</span>;
  return null;
};

const getStatusBadge = (status) => {
  if (!status) return null;
  const lower = status.toLowerCase();
  let color = '#777', bg = '#f0f0f0', icon = '';
  if (['delivered', 'read', 'success'].some(s => lower.includes(s))) { color = '#155724'; bg = '#d4edda'; icon = '\u2713\u2713'; }
  else if (lower === 'sent') { color = '#856404'; bg = '#fff3cd'; icon = '\u2713'; }
  else if (['failed', 'error', 'rejected', 'blocked'].some(s => lower.includes(s))) { color = '#721c24'; bg = '#f8d7da'; icon = '\u2717'; }
  else if (['pending', 'queued', 'processing'].some(s => lower.includes(s))) { color = '#0c5460'; bg = '#d1ecf1'; icon = '\u231B'; }
  return <span style={{ background: bg, color, padding: '2px 6px', borderRadius: '4px', fontSize: '9px', marginLeft: '5px' }}>{icon} {status}</span>;
};

const getMatchStatusBadge = (status) => {
  if (!status) return <span style={{ color: '#999', fontSize: '11px' }}>-</span>;
  const lower = status.toLowerCase();
  let color = '#777', bg = '#f0f0f0';
  if (['shortlisted', 'selected', 'hired', 'accepted', 'confirmed'].some(x => lower.includes(x))) { color = '#155724'; bg = '#d4edda'; }
  else if (['rejected', 'declined', 'not interested', 'withdrawn'].some(x => lower.includes(x))) { color = '#721c24'; bg = '#f8d7da'; }
  else if (['pending', 'in progress', 'processing'].some(x => lower.includes(x))) { color = '#856404'; bg = '#fff3cd'; }
  return <span style={{ background: bg, color, padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>{status}</span>;
};

const highlightFlaggedText = (text, flag) => {
  if (!text || !flag) return text || '';
  const patterns = FLAG_PATTERNS[flag]?.keywords || [];
  let highlighted = text;
  for (const keyword of patterns) {
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const color = flag === 'red' ? '#e94560' : flag === 'green' ? '#00b894' : '#f39c12';
    highlighted = highlighted.replace(regex, `<mark style="background:${color}20; color:${color}; font-weight:600; padding:1px 3px; border-radius:2px;">$1</mark>`);
  }
  return highlighted;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN');
};

const formatDuration = (secs) => {
  if (!secs) return '-';
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return `${mins}m ${s}s`;
};

const formatCallTime = (secs) => {
  if (!secs && secs !== 0) return '';
  const mins = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${mins}:${s.toString().padStart(2, '0')}`;
};

// User-level flags
const getUserFlags = (u) => {
  const flags = [];
  if (u.jobs_interested_count > 0) flags.push({ type: 'green', text: `Interested in ${u.jobs_interested_count} job(s)` });
  if (u.profile_completion_per >= 80) flags.push({ type: 'green', text: 'Profile 80%+ complete' });
  if (u.successful_calls > 0) flags.push({ type: 'green', text: `${u.successful_calls} successful call(s)` });
  if (u.cv_file_url) flags.push({ type: 'green', text: 'CV uploaded' });
  if (u.matching_status === 'pending' || u.matching_status === 'in_progress') flags.push({ type: 'yellow', text: 'Matching in progress' });
  if (u.profile_completion_per > 0 && u.profile_completion_per < 80) flags.push({ type: 'yellow', text: `Profile ${u.profile_completion_per}% complete` });
  if (u.total_calls > 0 && u.successful_calls === 0) flags.push({ type: 'yellow', text: 'No successful calls yet' });
  if ((u.recruiter_feedback_status || '').toLowerCase().includes('reject')) flags.push({ type: 'red', text: `Feedback: ${u.recruiter_feedback_status}` });
  if (u.jobs_interested_count === 0 && u.cumulative_matches_count > 5) flags.push({ type: 'red', text: 'No interest despite matches' });
  if (u.whatsapp_failed_attempt_count > 2) flags.push({ type: 'red', text: `${u.whatsapp_failed_attempt_count} WhatsApp failures` });
  return flags;
};

const flagColors = {
  red: { bg: '#f8d7da', color: '#721c24', icon: '\u{1F6A9}' },
  yellow: { bg: '#fff3cd', color: '#856404', icon: '\u26A0\uFE0F' },
  green: { bg: '#d4edda', color: '#155724', icon: '\u2705' }
};

// --- Sub-components ---

const MetricBadge = ({ label, value }) => {
  if (!value) return null;
  return (
    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: '8px', textAlign: 'center', minWidth: '80px' }}>
      <div style={{ color: '#aaa', fontSize: '9px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: '#fff', fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>{value}</div>
    </div>
  );
};

const UserFlags = ({ flags }) => {
  if (!flags || flags.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
      {flags.map((f, i) => {
        const c = flagColors[f.type] || flagColors.yellow;
        return (
          <span key={i} style={{ background: c.bg, color: c.color, padding: '3px 8px', borderRadius: '4px', fontSize: '10px' }}>
            {c.icon} {f.text}
          </span>
        );
      })}
    </div>
  );
};

// Chat Transcript Component
const ChatTranscript = ({ fullTranscript, textFallback }) => {
  if (fullTranscript && Array.isArray(fullTranscript) && fullTranscript.length > 0) {
    return (
      <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '15px', maxHeight: '500px', overflowY: 'auto' }}>
        {fullTranscript.map((turn, idx) => {
          const isAgent = turn.role === 'agent';
          const timeStr = formatCallTime(turn.time_in_call_secs);
          const flag = !isAgent ? detectFlag(turn.message, null) : null;
          const flagStyle = flag ? getFlagStyle(flag) : {};
          const highlightedMessage = flag ? highlightFlaggedText(turn.message || '', flag) : (turn.message || '');
          return (
            <div key={idx} style={{ display: 'flex', marginBottom: '12px', justifyContent: isAgent ? 'flex-start' : 'flex-end' }}>
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: '12px', fontSize: '12px', lineHeight: 1.5,
                ...flagStyle,
                background: isAgent ? '#e3f2fd' : (flag ? flagStyle.background : '#fff'),
                border: isAgent ? 'none' : '1px solid #ddd',
                borderBottomLeftRadius: isAgent ? '4px' : '12px',
                borderBottomRightRadius: isAgent ? '12px' : '4px'
              }}>
                <div style={{ fontSize: '9px', fontWeight: 600, color: isAgent ? '#1565c0' : '#555', marginBottom: '4px' }}>
                  {!isAgent && flag && getFlagIcon(flag)}{isAgent ? 'Bob (Agent)' : 'User'}
                  {timeStr && <span style={{ color: '#999', fontWeight: 'normal', marginLeft: '8px' }}>{timeStr}</span>}
                </div>
                <div style={{ color: '#333' }} dangerouslySetInnerHTML={{ __html: highlightedMessage }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (textFallback) {
    const lines = textFallback.split('\n').filter(l => l.trim());
    const hasRoles = lines.some(l => l.match(/^(agent|user):/i));
    if (hasRoles) {
      return (
        <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '15px', maxHeight: '500px', overflowY: 'auto' }}>
          {lines.map((line, idx) => {
            const agentMatch = line.match(/^agent:\s*(.+)/i);
            const userMatch = line.match(/^user:\s*(.+)/i);
            if (agentMatch) {
              return (
                <div key={idx} style={{ display: 'flex', marginBottom: '8px', justifyContent: 'flex-start' }}>
                  <div style={{ maxWidth: '75%', padding: '8px 12px', borderRadius: '10px', background: '#e3f2fd', borderBottomLeftRadius: '4px', fontSize: '11px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 600, color: '#1565c0', marginBottom: '3px' }}>Bob (Agent)</div>
                    <div>{agentMatch[1]}</div>
                  </div>
                </div>
              );
            } else if (userMatch) {
              const flag = detectFlag(userMatch[1], null);
              const flagStyle = flag ? getFlagStyle(flag) : {};
              const highlightedText = flag ? highlightFlaggedText(userMatch[1], flag) : userMatch[1];
              return (
                <div key={idx} style={{ display: 'flex', marginBottom: '8px', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '75%', padding: '8px 12px', borderRadius: '10px', background: flag ? flagStyle.background : '#fff', border: '1px solid #ddd', borderBottomRightRadius: '4px', fontSize: '11px', ...flagStyle }}>
                    <div style={{ fontSize: '9px', fontWeight: 600, color: '#555', marginBottom: '3px' }}>{flag && getFlagIcon(flag)}User</div>
                    <div dangerouslySetInnerHTML={{ __html: highlightedText }} />
                  </div>
                </div>
              );
            }
            return <div key={idx} style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>{line}</div>;
          })}
        </div>
      );
    }
    return (
      <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '15px', maxHeight: '500px', overflowY: 'auto' }}>
        <div style={{ fontSize: '11px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{textFallback}</div>
      </div>
    );
  }
  return <div style={{ color: '#999', fontSize: '11px' }}>No transcript available</div>;
};

// WhatsApp Messages Section
const WhatsAppMessagesSection = ({ messages }) => {
  const [sortOrder, setSortOrder] = useState('desc');
  if (!messages || messages.length === 0) return <div className="ready-state">No WhatsApp messages found</div>;

  const sorted = [...messages].sort((a, b) => {
    const aDate = new Date(a.date || 0).getTime();
    const bDate = new Date(b.date || 0).getTime();
    return sortOrder === 'desc' ? bDate - aDate : aDate - bDate;
  });

  const flagCounts = { red: 0, yellow: 0, green: 0 };
  sorted.forEach(m => { const flag = detectFlag(m.message_text, m.status); if (flag) flagCounts[flag]++; });

  return (
    <div className="table-wrapper">
      <div style={{ padding: '10px 15px', borderBottom: '1px solid #eee', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '12px' }}>Order:</span>
        <button className={`btn btn-xs ${sortOrder === 'desc' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSortOrder('desc')}>Newest First</button>
        <button className={`btn btn-xs ${sortOrder === 'asc' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSortOrder('asc')}>Oldest First</button>
        <span style={{ marginLeft: 'auto', fontSize: '11px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {flagCounts.green > 0 && <span style={{ color: '#00b894' }}>{'\u2705'} {flagCounts.green}</span>}
          {flagCounts.yellow > 0 && <span style={{ color: '#f39c12' }}>{'\u26A0\uFE0F'} {flagCounts.yellow}</span>}
          {flagCounts.red > 0 && <span style={{ color: '#e94560' }}>{'\u{1F6A9}'} {flagCounts.red}</span>}
          <span style={{ color: '#777' }}>{messages.length} messages</span>
        </span>
      </div>
      <div style={{ padding: '15px', maxHeight: '600px', overflowY: 'auto', background: '#ece5dd' }}>
        {sorted.map((m, idx) => {
          const isInbound = m.direction === 'inbound' || m.sender === 'user';
          const flag = detectFlag(m.message_text, m.status);
          const flagStyle = flag ? getFlagStyle(flag) : {};
          const highlightedText = flag ? highlightFlaggedText(m.message_text || '', flag) : (m.message_text || '');
          return (
            <div key={idx} style={{ display: 'flex', marginBottom: '10px', justifyContent: isInbound ? 'flex-start' : 'flex-end' }}>
              <div style={{
                maxWidth: '70%', padding: '10px 15px', borderRadius: '12px', fontSize: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                ...flagStyle,
                background: isInbound ? (flag ? flagStyle.background : '#fff') : '#dcf8c6',
                borderBottomLeftRadius: isInbound ? '4px' : '12px',
                borderBottomRightRadius: isInbound ? '12px' : '4px'
              }}>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {flag && getFlagIcon(flag)}
                  <span dangerouslySetInnerHTML={{ __html: highlightedText }} />
                </div>
                <div style={{ fontSize: '9px', color: '#777', marginTop: '5px', textAlign: 'right', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '5px' }}>
                  <span>{formatDate(m.date)}</span>
                  {getStatusBadge(m.status)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Calls Section
const CallsSection = ({ conversations }) => {
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedCall, setExpandedCall] = useState(null);
  const [audioPlayers, setAudioPlayers] = useState({});

  if (!conversations || conversations.length === 0) return <div className="ready-state">No calls found</div>;

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sortIcon = (field) => sortField === field ? (sortDir === 'desc' ? ' \u25BC' : ' \u25B2') : '';

  const sorted = [...conversations].sort((a, b) => {
    let aVal, bVal;
    if (sortField === 'date') { aVal = new Date(a.date || 0).getTime(); bVal = new Date(b.date || 0).getTime(); }
    else if (sortField === 'duration') { aVal = a.duration_secs || 0; bVal = b.duration_secs || 0; }
    else if (sortField === 'status') { aVal = a.call_successful === 'success' ? 1 : 0; bVal = b.call_successful === 'success' ? 1 : 0; }
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  let successCount = 0, failedCount = 0, totalDuration = 0;
  sorted.forEach(c => {
    if (c.call_successful === 'success') successCount++; else failedCount++;
    totalDuration += c.duration_secs || 0;
  });

  const toggleAudio = (convId) => {
    setAudioPlayers(prev => ({ ...prev, [convId]: !prev[convId] }));
  };

  return (
    <div>
      <div className="table-wrapper" style={{ marginBottom: '15px' }}>
        <div style={{ padding: '10px 15px', borderBottom: '1px solid #eee', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '12px' }}>Sort by:</span>
          <button className={`btn btn-xs ${sortField === 'date' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleSort('date')}>Date{sortIcon('date')}</button>
          <button className={`btn btn-xs ${sortField === 'duration' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleSort('duration')}>Duration{sortIcon('duration')}</button>
          <button className={`btn btn-xs ${sortField === 'status' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleSort('status')}>Status{sortIcon('status')}</button>
          <span style={{ marginLeft: 'auto', fontSize: '11px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            {successCount > 0 && <span style={{ color: '#00b894' }}>{'\u2705'} {successCount} success</span>}
            {failedCount > 0 && <span style={{ color: '#e94560' }}>{'\u274C'} {failedCount} failed</span>}
            <span style={{ color: '#777' }}>Total: {formatDuration(totalDuration)}</span>
          </span>
        </div>
      </div>

      {sorted.map((c, i) => (
        <div key={i} className="table-wrapper" style={{ marginBottom: '15px' }}>
          <div style={{ padding: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
              <h4 style={{ margin: 0, color: '#16213e' }}>Call {i + 1}: {c.call_summary_title || 'Conversation'}</h4>
              <div style={{ fontSize: '11px', color: '#777', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span>{formatDate(c.date)}</span>
                <span style={{ background: '#e8f4f8', padding: '2px 8px', borderRadius: '4px' }}>Duration: {formatDuration(c.duration_secs)}</span>
                <span>{c.phone_direction || ''}</span>
                <span style={{
                  background: c.call_successful === 'success' ? '#d4edda' : '#f8d7da',
                  color: c.call_successful === 'success' ? '#155724' : '#721c24',
                  padding: '2px 8px', borderRadius: '4px'
                }}>{c.call_successful || c.status}</span>
                {c.elevenlabs_conversation_id && (
                  <button className="btn btn-xs btn-secondary" onClick={() => toggleAudio(c.elevenlabs_conversation_id)} title="Play Recording">
                    {'\u25B6'} Audio
                  </button>
                )}
              </div>
            </div>

            {c.elevenlabs_conversation_id && audioPlayers[c.elevenlabs_conversation_id] && (
              <div style={{ marginBottom: '10px' }}>
                <audio controls style={{ width: '100%', height: '35px' }} src={`${API_BASE}/conversation/audio/${c.elevenlabs_conversation_id}`}>
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}

            {c.transcript_summary && (
              <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '6px', marginBottom: '10px', fontSize: '12px' }}>
                <strong>Summary:</strong> {c.transcript_summary}
              </div>
            )}

            <details style={{ marginTop: '10px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#16213e' }}>View Transcript</summary>
              <div style={{ marginTop: '10px' }}>
                <ChatTranscript fullTranscript={c.full_transcript} textFallback={c.transcript_text} />
              </div>
            </details>
          </div>
        </div>
      ))}
    </div>
  );
};

// Job Matches Section
const MatchesSection = ({ matches }) => {
  const [sortField, setSortField] = useState('matching_score');
  const [sortDir, setSortDir] = useState('desc');

  if (!matches || matches.length === 0) return <div className="ready-state">No job matches found</div>;

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };
  const sortIcon = (field) => sortField === field ? (sortDir === 'desc' ? ' \u25BC' : ' \u25B2') : '';

  const sorted = [...matches].sort((a, b) => {
    if (sortField === 'matching_score') return sortDir === 'desc' ? (b.matching_score || 0) - (a.matching_score || 0) : (a.matching_score || 0) - (b.matching_score || 0);
    if (sortField === 'date') return sortDir === 'desc' ? new Date(b.matched_at || 0) - new Date(a.matched_at || 0) : new Date(a.matched_at || 0) - new Date(b.matched_at || 0);
    if (sortField === 'role') { const cmp = (a.role_name || '').localeCompare(b.role_name || ''); return sortDir === 'desc' ? -cmp : cmp; }
    return 0;
  });

  const statusCounts = { positive: 0, negative: 0, pending: 0 };
  sorted.forEach(m => {
    const s = (m.status || '').toLowerCase();
    if (['shortlisted', 'selected', 'hired', 'accepted', 'confirmed'].some(x => s.includes(x))) statusCounts.positive++;
    else if (['rejected', 'declined', 'not interested', 'withdrawn'].some(x => s.includes(x))) statusCounts.negative++;
    else statusCounts.pending++;
  });

  return (
    <div className="table-wrapper">
      <div style={{ padding: '10px 15px', borderBottom: '1px solid #eee', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '12px' }}>Sort by:</span>
        <button className={`btn btn-xs ${sortField === 'matching_score' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleSort('matching_score')}>Score{sortIcon('matching_score')}</button>
        <button className={`btn btn-xs ${sortField === 'date' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleSort('date')}>Date{sortIcon('date')}</button>
        <button className={`btn btn-xs ${sortField === 'role' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleSort('role')}>Role{sortIcon('role')}</button>
        <span style={{ marginLeft: 'auto', fontSize: '11px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {statusCounts.positive > 0 && <span style={{ color: '#00b894' }}>{'\u2705'} {statusCounts.positive}</span>}
          {statusCounts.pending > 0 && <span style={{ color: '#f39c12' }}>{'\u231B'} {statusCounts.pending}</span>}
          {statusCounts.negative > 0 && <span style={{ color: '#e94560' }}>{'\u274C'} {statusCounts.negative}</span>}
          <span style={{ color: '#777' }}>{matches.length} matches</span>
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Role</th>
              <th>Score</th>
              <th>Status</th>
              <th>Location</th>
              <th>Experience</th>
              <th>Rate/Month</th>
              <th>Matched At</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, idx) => (
              <React.Fragment key={idx}>
                <tr>
                  <td style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>{m.role_name || '-'}</div>
                    <div style={{ fontSize: '10px', color: '#777' }}>{m.role_code || ''}</div>
                  </td>
                  <td>
                    <span style={{
                      background: m.matching_score >= 8 ? '#00b894' : m.matching_score >= 7 ? '#fdcb6e' : '#e94560',
                      color: 'white', padding: '2px 8px', borderRadius: '4px', fontWeight: 600
                    }}>{m.matching_score || '-'}</span>
                  </td>
                  <td>{getMatchStatusBadge(m.status)}</td>
                  <td>{m.location || '-'}</td>
                  <td>{m.experience_range || '-'}</td>
                  <td>{m.vendor_rate_per_month || '-'}</td>
                  <td style={{ fontSize: '10px' }}>{formatDate(m.matched_at)}</td>
                </tr>
                {m.match_reasoning && (
                  <tr><td colSpan={7} style={{ background: '#f9f9f9', fontSize: '10px', padding: '8px' }}><strong>Reasoning:</strong> {m.match_reasoning}</td></tr>
                )}
                {m.key_strengths && (
                  <tr><td colSpan={7} style={{ background: '#e8f8f0', fontSize: '10px', padding: '8px' }}>{'\u2705'} <strong>Strengths:</strong> {m.key_strengths}</td></tr>
                )}
                {m.potential_concerns && (
                  <tr><td colSpan={7} style={{ background: '#fef3e8', fontSize: '10px', padding: '8px' }}>{'\u26A0\uFE0F'} <strong>Concerns:</strong> {m.potential_concerns}</td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Interested Jobs Section
const InterestedSection = ({ jobs }) => {
  if (!jobs || jobs.length === 0) return <div className="ready-state">No interested jobs found</div>;
  return (
    <div className="table-wrapper">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Role</th>
              <th>Location</th>
              <th>Experience</th>
              <th>Rate/Month</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j, idx) => (
              <React.Fragment key={idx}>
                <tr>
                  <td style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>{j.role_name || '-'}</div>
                    <div style={{ fontSize: '10px', color: '#777' }}>{j.role_code || ''}</div>
                  </td>
                  <td>{j.location || '-'}</td>
                  <td>{j.experience_range || '-'}</td>
                  <td>{j.vendor_rate_per_month || '-'}</td>
                  <td>{j.status || '-'}</td>
                </tr>
                {j.brief_context && (
                  <tr><td colSpan={5} style={{ background: '#f9f9f9', fontSize: '10px', padding: '8px' }}>{j.brief_context}</td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Generated CV Section
const GeneratedCVSection = ({ cvData }) => {
  if (!cvData) return <div className="ready-state">No CV data available</div>;

  let cv = cvData;
  if (typeof cv === 'string') {
    try { cv = JSON.parse(cv); } catch (e) { return <div style={{ fontSize: '12px', lineHeight: 1.6, whiteSpace: 'pre-wrap', padding: '20px' }}>{cv}</div>; }
  }

  return (
    <div className="table-wrapper" style={{ padding: '20px' }}>
      {cv.professional_summary && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ color: '#16213e', margin: '0 0 10px 0', borderBottom: '2px solid #e94560', paddingBottom: '5px' }}>Professional Summary</h4>
          <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#444' }}>{cv.professional_summary}</p>
        </div>
      )}

      {cv.current_role && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ color: '#16213e', margin: '0 0 10px 0', borderBottom: '2px solid #e94560', paddingBottom: '5px' }}>Current Role</h4>
          <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#16213e' }}>{cv.current_role.title || '-'}</div>
            <div style={{ fontSize: '13px', color: '#555' }}>{cv.current_role.company || '-'}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>{cv.current_role.duration || '-'}</div>
            {cv.current_role.responsibilities?.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Key Responsibilities:</div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#444', lineHeight: 1.6 }}>
                  {cv.current_role.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {cv.work_experience?.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ color: '#16213e', margin: '0 0 10px 0', borderBottom: '2px solid #e94560', paddingBottom: '5px' }}>Work Experience</h4>
          {cv.work_experience.map((exp, i) => (
            <div key={i} style={{ background: '#f8f9fa', padding: '12px 15px', borderRadius: '8px', marginBottom: '10px', borderLeft: '3px solid #e94560' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#16213e' }}>{exp.title || exp.role || '-'}</div>
              <div style={{ fontSize: '12px', color: '#555' }}>{exp.company || '-'}</div>
              <div style={{ fontSize: '11px', color: '#888' }}>{exp.duration || exp.period || '-'}</div>
              {exp.highlights && <div style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>{Array.isArray(exp.highlights) ? exp.highlights.join(', ') : exp.highlights}</div>}
            </div>
          ))}
        </div>
      )}

      {cv.skills && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ color: '#16213e', margin: '0 0 10px 0', borderBottom: '2px solid #e94560', paddingBottom: '5px' }}>Skills</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
            {Object.entries(cv.skills).map(([category, skillList]) => {
              if (!skillList || (Array.isArray(skillList) && skillList.length === 0)) return null;
              const skillArray = Array.isArray(skillList) ? skillList : [skillList];
              return (
                <div key={category} style={{ flex: 1, minWidth: '200px', background: '#f8f9fa', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#555', marginBottom: '6px', textTransform: 'capitalize' }}>{category.replace(/_/g, ' ')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {skillArray.map((s, i) => <span key={i} style={{ background: '#e8f4f8', color: '#16213e', padding: '3px 8px', borderRadius: '4px', fontSize: '10px' }}>{s}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {cv.education?.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ color: '#16213e', margin: '0 0 10px 0', borderBottom: '2px solid #e94560', paddingBottom: '5px' }}>Education</h4>
          {cv.education.map((edu, i) => (
            <div key={i} style={{ background: '#f8f9fa', padding: '10px 15px', borderRadius: '8px', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#16213e' }}>{edu.degree || edu.qualification || '-'}</div>
              <div style={{ fontSize: '12px', color: '#555' }}>{edu.institution || edu.college || '-'}</div>
              <div style={{ fontSize: '11px', color: '#888' }}>{edu.year || edu.period || '-'}</div>
            </div>
          ))}
        </div>
      )}

      {cv.compensation_and_availability && (() => {
        const comp = cv.compensation_and_availability;
        return (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ color: '#16213e', margin: '0 0 10px 0', borderBottom: '2px solid #e94560', paddingBottom: '5px' }}>Compensation & Availability</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
              {comp.current_ctc && <div style={{ background: '#d4edda', padding: '10px', borderRadius: '8px', textAlign: 'center' }}><div style={{ fontSize: '10px', color: '#155724' }}>Current CTC</div><div style={{ fontSize: '14px', fontWeight: 600, color: '#155724' }}>{comp.current_ctc}</div></div>}
              {comp.expected_ctc && <div style={{ background: '#fff3cd', padding: '10px', borderRadius: '8px', textAlign: 'center' }}><div style={{ fontSize: '10px', color: '#856404' }}>Expected</div><div style={{ fontSize: '14px', fontWeight: 600, color: '#856404' }}>{comp.expected_ctc}</div></div>}
              {comp.notice_period && <div style={{ background: '#d1ecf1', padding: '10px', borderRadius: '8px', textAlign: 'center' }}><div style={{ fontSize: '10px', color: '#0c5460' }}>Notice Period</div><div style={{ fontSize: '14px', fontWeight: 600, color: '#0c5460' }}>{comp.notice_period}</div></div>}
              {comp.earliest_join_date && <div style={{ background: '#e8f4f8', padding: '10px', borderRadius: '8px', textAlign: 'center' }}><div style={{ fontSize: '10px', color: '#16213e' }}>Earliest Join</div><div style={{ fontSize: '14px', fontWeight: 600, color: '#16213e' }}>{comp.earliest_join_date}</div></div>}
            </div>
          </div>
        );
      })()}

      {cv.career_preferences && (() => {
        const prefs = cv.career_preferences;
        return (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ color: '#16213e', margin: '0 0 10px 0', borderBottom: '2px solid #e94560', paddingBottom: '5px' }}>Career Preferences</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {prefs.work_environment && <span style={{ background: '#f0f0f0', padding: '5px 12px', borderRadius: '15px', fontSize: '11px' }}>{'\u{1F3E2}'} {prefs.work_environment}</span>}
              {prefs.leadership_preference && <span style={{ background: '#f0f0f0', padding: '5px 12px', borderRadius: '15px', fontSize: '11px' }}>{'\u{1F465}'} {prefs.leadership_preference}</span>}
              {prefs.remote_work_preference && <span style={{ background: '#f0f0f0', padding: '5px 12px', borderRadius: '15px', fontSize: '11px' }}>{'\u{1F3E0}'} Remote: {prefs.remote_work_preference}</span>}
            </div>
          </div>
        );
      })()}

      {cv.career_motivation && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ color: '#16213e', margin: '0 0 10px 0', borderBottom: '2px solid #e94560', paddingBottom: '5px' }}>Career Motivation</h4>
          <p style={{ fontSize: '12px', lineHeight: 1.6, color: '#444', background: '#f8f9fa', padding: '12px', borderRadius: '8px' }}>
            {typeof cv.career_motivation === 'string' ? cv.career_motivation : JSON.stringify(cv.career_motivation)}
          </p>
        </div>
      )}
    </div>
  );
};

// Screening Section
const screeningCategoryLabels = {
  ctc: 'CTC', notice_period: 'Notice Period', location: 'Location',
  relocation: 'Relocation', experience: 'Experience', education: 'Education',
  contract_type: 'Contract Type', skills_present: 'Skills (Present)',
  skills_absent: 'Skills (Absent)',
};

const ScreeningSection = ({ sessions, skills, results }) => {
  const [expandedSession, setExpandedSession] = useState(null);

  if (!sessions || sessions.length === 0) {
    return (
      <div className="table-wrapper" style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '10px', opacity: 0.3 }}>{'🔍'}</div>
        <div style={{ color: '#999', fontSize: '14px' }}>No screening sessions for this candidate</div>
      </div>
    );
  }

  const statusColors = {
    completed: '#00b894', partial_screening_done: '#fdcb6e',
    failed: '#e94560', pending: '#74b9ff', in_progress: '#a29bfe',
  };
  const outcomeColors = {
    passed: '#00b894', failed: '#e94560', inconclusive: '#fdcb6e',
    partially_passed: '#ffa502',
  };
  const levelColors = {
    expert: '#00b894', advanced: '#00b894',
    intermediate: '#fdcb6e', beginner: '#e94560',
  };

  const formatDur = (secs) => {
    if (!secs) return '-';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Group skills by session
  const skillsBySession = {};
  (skills || []).forEach(sk => {
    if (!skillsBySession[sk.session_id]) skillsBySession[sk.session_id] = [];
    skillsBySession[sk.session_id].push(sk);
  });

  // Group results by session
  const resultsBySession = {};
  (results || []).forEach(r => {
    if (!resultsBySession[r.session_id]) resultsBySession[r.session_id] = [];
    resultsBySession[r.session_id].push(r);
  });

  return (
    <div>
      {sessions.map((s, idx) => {
        const isExpanded = expandedSession === s.id;
        const sessionSkills = skillsBySession[s.id] || [];
        const sessionResults = resultsBySession[s.id] || [];

        // All skills sorted: critical first, then by score desc
        const allSkills = [...sessionSkills].sort((a, b) => {
          const impOrder = { critical: 0, important: 1, nice_to_have: 2 };
          const aImp = impOrder[a.importance] ?? 3;
          const bImp = impOrder[b.importance] ?? 3;
          if (aImp !== bImp) return aImp - bImp;
          return (b.deep_dive_score || 0) - (a.deep_dive_score || 0);
        });

        // All discussed results, sorted: failed first
        const discussedResults = sessionResults
          .filter(r => r.was_discussed)
          .sort((a, b) => {
            if (a.passed === false && b.passed !== false) return -1;
            if (a.passed !== false && b.passed === false) return 1;
            return 0;
          });

        return (
          <div key={s.id} className="table-wrapper" style={{ marginBottom: 12 }}>
            {/* Session header - clickable */}
            <div
              onClick={() => setExpandedSession(isExpanded ? null : s.id)}
              style={{
                padding: '12px 15px', cursor: 'pointer', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                background: idx === 0 ? '#f0f7ff' : '#fafafa',
                borderBottom: isExpanded ? '1px solid #eee' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13 }}>
                  Session #{s.session_number || idx + 1} — {s.role_name}
                  {s.role_code && <span style={{ color: '#999', fontWeight: 400 }}> ({s.role_code})</span>}
                </strong>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: `${statusColors[s.screening_status] || '#b2bec3'}25`,
                  color: statusColors[s.screening_status] || '#636e72'
                }}>
                  {s.screening_status?.replace(/_/g, ' ')}
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: `${outcomeColors[s.screening_outcome] || '#b2bec3'}25`,
                  color: outcomeColors[s.screening_outcome] || '#636e72'
                }}>
                  {s.screening_outcome || 'pending'}
                </span>
                {s.next_action && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                    background: s.next_action === 'forward_to_client' ? '#00b89420' :
                               s.next_action === 'reject' ? '#e9456020' : '#fdcb6e20',
                    color: s.next_action === 'forward_to_client' ? '#00b894' :
                           s.next_action === 'reject' ? '#e94560' : '#e17055'
                  }}>
                    {s.next_action.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 15, fontSize: 11, color: '#666', flexWrap: 'wrap' }}>
                {s.overall_score != null && <span>Score: <strong>{s.overall_score}</strong></span>}
                <span>Complete: <strong>{s.completion_percentage}%</strong></span>
                <span>Duration: <strong>{formatDur(s.call_duration_secs)}</strong></span>
                <span>Qs: <strong>{s.total_questions_asked || '-'}</strong></span>
                <span>{s.created_at?.split('T')[0]}</span>
                <span style={{ fontSize: 14 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ padding: 15 }}>
                {/* AI Summary */}
                {s.ai_summary && (
                  <div style={{ marginBottom: 12, padding: 12, background: '#f8f9fa', borderRadius: 8, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    <strong>AI Summary:</strong> {s.ai_summary}
                  </div>
                )}

                {/* Recruiter Notes */}
                {s.recruiter_notes && s.recruiter_notes !== s.ai_summary && (
                  <div style={{ marginBottom: 12, padding: 12, background: '#fff3cd', borderRadius: 8, fontSize: 12, lineHeight: 1.6 }}>
                    <strong>Recruiter Notes:</strong> {s.recruiter_notes}
                  </div>
                )}

                {/* Deal Breakers - detailed breakdown */}
                {s.deal_breakers_hit?.length > 0 && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', background: '#e9456010', borderRadius: 6, border: '1px solid #e9456030' }}>
                    <strong style={{ color: '#e94560', fontSize: 11, display: 'block', marginBottom: 4 }}>Deal Breakers Hit:</strong>
                    {s.deal_breakers_hit.map((db, i) => {
                      const parts = db.split(':');
                      const prefix = parts[0].trim();
                      const detail = parts.length > 1 ? parts.slice(1).join(':').trim() : '';
                      const label = screeningCategoryLabels[prefix.toLowerCase()] || prefix.replace(/_/g, ' ');
                      return (
                        <div key={i} style={{ fontSize: 11, marginBottom: 2, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                          <span style={{ fontWeight: 700, color: '#e94560', minWidth: 'fit-content' }}>{label}:</span>
                          <span>{detail || db}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Screening Checks - all discussed results with full detail */}
                {discussedResults.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Screening Checks:</strong>
                    <div style={{ width: '100%', overflowX: 'auto', maxWidth: '100%' }}>
                      <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '10%' }} />
                          <col style={{ width: '7%' }} />
                          <col style={{ width: '25%' }} />
                          <col style={{ width: '28%' }} />
                          <col style={{ width: '30%' }} />
                        </colgroup>
                        <thead>
                          <tr style={{ background: '#e9ecef' }}>
                            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, whiteSpace: 'normal' }}>Category</th>
                            <th style={{ padding: '4px 8px', fontWeight: 600, whiteSpace: 'normal' }}>Result</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, whiteSpace: 'normal' }}>JD Requirement</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, whiteSpace: 'normal' }}>Candidate Response</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, whiteSpace: 'normal' }}>AI Assessment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {discussedResults.map((r, i) => (
                            <tr key={i} style={{
                              background: r.passed === false ? '#e9456008' : 'transparent',
                              borderBottom: '1px solid #eee'
                            }}>
                              <td style={{ padding: '5px 8px', fontWeight: 600, whiteSpace: 'normal', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
                                {screeningCategoryLabels[r.category] || r.category?.replace(/_/g, ' ')}
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'center', whiteSpace: 'normal', overflow: 'hidden' }}>
                                <span style={{
                                  padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                                  background: r.passed === true ? '#00b89420' : r.passed === false ? '#e9456020' : '#fdcb6e20',
                                  color: r.passed === true ? '#00b894' : r.passed === false ? '#e94560' : '#e17055',
                                }}>
                                  {r.passed === true ? 'PASS' : r.passed === false ? 'FAIL' : 'N/A'}
                                </span>
                                {r.negotiation_outcome && r.negotiation_outcome !== 'not_applicable' && (
                                  <div style={{ fontSize: 8, color: '#636e72', marginTop: 2 }}>
                                    {r.negotiation_outcome.replace(/_/g, ' ')}
                                    {r.negotiated_value && ` → ${r.negotiated_value}`}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '5px 8px', lineHeight: 1.4, whiteSpace: 'normal', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
                                {r.jd_requirement || '-'}
                              </td>
                              <td style={{ padding: '5px 8px', lineHeight: 1.4, fontStyle: 'italic', color: '#555', whiteSpace: 'normal', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
                                {r.candidate_response || '-'}
                              </td>
                              <td style={{ padding: '5px 8px', lineHeight: 1.4, whiteSpace: 'normal', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
                                {r.ai_assessment || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Skill Assessments - full detail with all columns */}
                {allSkills.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Skill Assessments ({allSkills.length}):</strong>
                    <div style={{ width: '100%', overflowX: 'auto', maxWidth: '100%' }}>
                      <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '7%' }} />
                          <col style={{ width: '7%' }} />
                          <col style={{ width: '6%' }} />
                          <col style={{ width: '8%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '20%' }} />
                        </colgroup>
                        <thead>
                          <tr style={{ background: '#e9ecef' }}>
                            <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600, whiteSpace: 'normal' }}>Skill</th>
                            <th style={{ padding: '4px 6px', fontWeight: 600, whiteSpace: 'normal' }}>Importance</th>
                            <th style={{ padding: '4px 6px', fontWeight: 600, whiteSpace: 'normal' }}>Score</th>
                            <th style={{ padding: '4px 6px', fontWeight: 600, whiteSpace: 'normal' }}>Level</th>
                            <th style={{ padding: '4px 6px', fontWeight: 600, whiteSpace: 'normal' }}>Source</th>
                            <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600, whiteSpace: 'normal' }}>JD Requirement</th>
                            <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600, whiteSpace: 'normal' }}>Candidate Experience</th>
                            <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600, whiteSpace: 'normal' }}>AI Assessment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allSkills.map((sk, i) => {
                            const scoreColor = (sk.deep_dive_score || 0) >= 7 ? '#00b894' :
                              (sk.deep_dive_score || 0) >= 5 ? '#fdcb6e' : '#e94560';
                            const importanceColor = sk.importance === 'critical' ? '#e94560' :
                              sk.importance === 'important' ? '#e17055' : '#636e72';
                            return (
                              <tr key={i} style={{
                                background: sk.importance === 'critical' && (sk.deep_dive_score || 0) < 6 ? '#e9456008' : 'transparent',
                                borderBottom: '1px solid #eee'
                              }}>
                                <td style={{ padding: '5px 6px', fontWeight: 600, whiteSpace: 'normal', overflow: 'hidden', wordBreak: 'break-all' }}>
                                  {sk.skill_name}
                                  {sk.is_required_by_jd && <span style={{ fontSize: 8, color: '#0984e3', marginLeft: 3 }} title="Required by JD">JD</span>}
                                  {sk.is_present_in_cv && <span style={{ fontSize: 8, color: '#00b894', marginLeft: 3 }} title="Present in CV">CV</span>}
                                </td>
                                <td style={{ padding: '5px 6px', textAlign: 'center', whiteSpace: 'normal', overflow: 'hidden' }}>
                                  <span style={{
                                    padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700,
                                    background: `${importanceColor}20`, color: importanceColor,
                                  }}>{sk.importance || '-'}</span>
                                </td>
                                <td style={{ padding: '5px 6px', textAlign: 'center', whiteSpace: 'normal', overflow: 'hidden' }}>
                                  {sk.deep_dive_score != null ? (
                                    <span style={{ fontWeight: 700, color: scoreColor }}>{sk.deep_dive_score}/10</span>
                                  ) : '-'}
                                </td>
                                <td style={{ padding: '5px 6px', textAlign: 'center', whiteSpace: 'normal', overflow: 'hidden' }}>
                                  <span style={{
                                    fontSize: 8, fontWeight: 600,
                                    color: levelColors[sk.proficiency_level] || '#636e72',
                                  }}>{sk.proficiency_level || '-'}</span>
                                </td>
                                <td style={{ padding: '5px 6px', textAlign: 'center', whiteSpace: 'normal', overflow: 'hidden', fontSize: 9 }}>
                                  {sk.skill_source || '-'}
                                </td>
                                <td style={{ padding: '5px 6px', lineHeight: 1.4, whiteSpace: 'normal', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
                                  {sk.jd_experience_required || '-'}
                                </td>
                                <td style={{ padding: '5px 6px', lineHeight: 1.4, whiteSpace: 'normal', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-all', fontStyle: 'italic', color: '#555' }}>
                                  {sk.candidate_claimed_experience || '-'}
                                </td>
                                <td style={{ padding: '5px 6px', lineHeight: 1.4, whiteSpace: 'normal', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
                                  {sk.ai_assessment || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Next Action */}
                {s.next_action && (
                  <div style={{ fontSize: 11, marginBottom: 8 }}>
                    <strong>Next Action:</strong> <span style={{ color: '#0984e3' }}>{s.next_action.replace(/_/g, ' ')}</span>
                  </div>
                )}

                {/* Session Meta */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, color: '#636e72', marginBottom: 8 }}>
                  {s.total_questions_asked != null && <span><strong>Questions Asked:</strong> {s.total_questions_asked}</span>}
                  {s.candidate_engagement && <span><strong>Engagement:</strong> {s.candidate_engagement}</span>}
                  {s.non_negotiable_passed != null && (
                    <span><strong>Non-Negotiables:</strong> <span style={{ color: s.non_negotiable_passed ? '#00b894' : '#e94560', fontWeight: 600 }}>{s.non_negotiable_passed ? 'Passed' : 'Failed'}</span></span>
                  )}
                  {s.completed_at && <span><strong>Completed:</strong> {s.completed_at.split('T')[0]}</span>}
                </div>

                {/* Parts completed/missing */}
                {(s.parts_completed?.length > 0 || s.parts_missing?.length > 0) && (
                  <div style={{ fontSize: 10, color: '#636e72' }}>
                    {s.parts_completed?.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <strong>Completed:</strong> {s.parts_completed.map(p => p.replace(/_/g, ' ')).join(', ')}
                      </div>
                    )}
                    {s.parts_missing?.length > 0 && (
                      <div style={{ color: '#e17055' }}>
                        <strong>Missing:</strong> {s.parts_missing.map(p => p.replace(/_/g, ' ')).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// AI Summary Section
const SummarySection = ({ user }) => {
  if (!user.cumulative_summary) {
    return (
      <div className="table-wrapper" style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '10px', opacity: 0.3 }}>{'\u{1F4CB}'}</div>
        <div style={{ color: '#999', fontSize: '14px' }}>No AI summary available for this candidate</div>
      </div>
    );
  }

  let summary = user.cumulative_summary;
  if (typeof summary === 'string') {
    // Try parsing, and if truncated JSON, attempt repair with common closings
    let parsed = null;
    try { parsed = JSON.parse(summary); } catch (e) {
      const repairs = [']}', '"}', '"]}', '}', '"]}}', '}}'];
      for (const fix of repairs) {
        try { parsed = JSON.parse(summary + fix); break; } catch (_) {}
      }
    }
    if (parsed && typeof parsed === 'object') {
      summary = parsed;
    } else {
      return (
        <div className="table-wrapper" style={{ padding: '20px' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#16213e' }}>AI-Generated Candidate Summary</h4>
          <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', fontSize: '12px', lineHeight: 1.6 }}>{summary}</div>
        </div>
      );
    }
  }

  if (typeof summary !== 'object') {
    return (
      <div className="table-wrapper" style={{ padding: '20px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#16213e' }}>AI-Generated Candidate Summary</h4>
        <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', fontSize: '12px', lineHeight: 1.6 }}>{String(summary)}</div>
      </div>
    );
  }

  // Safely render any value - handles strings, dicts, arrays
  const safeRender = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val)) return val.map(v => safeRender(v)).join(', ');
    if (typeof val === 'object') return Object.entries(val).map(([k, v]) => `${k}: ${safeRender(v)}`).join(', ');
    return String(val);
  };

  const SummaryCard = ({ title, icon, items, bgColor, borderColor, textColor }) => {
    if (!items || items.length === 0) return null;
    return (
      <div style={{ background: bgColor, padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${borderColor}` }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: textColor, marginBottom: '10px' }}>{icon} {title}</div>
        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: textColor === '#721c24' ? '#721c24' : '#444', lineHeight: 1.8 }}>
          {items.map((item, i) => <li key={i}>{safeRender(item)}</li>)}
        </ul>
      </div>
    );
  };

  // Format qualification_assessment (it's a dict with score, recommendation, key_reasoning)
  const formatQualification = (qa) => {
    if (!qa) return null;
    if (typeof qa === 'string') return qa;
    const parts = [];
    if (qa.score !== undefined) parts.push(`Score: ${qa.score}/10`);
    if (qa.recommendation) parts.push(qa.recommendation.replace(/_/g, ' '));
    return parts.join(' - ') || safeRender(qa);
  };

  return (
    <div className="table-wrapper" style={{ padding: '20px' }}>
      <h4 style={{ margin: '0 0 15px 0', color: '#16213e' }}>AI-Generated Candidate Summary</h4>

      <div style={{ background: 'linear-gradient(135deg, #16213e 0%, #1a1a2e 100%)', padding: '15px 20px', borderRadius: '8px', marginBottom: '15px' }}>
        <div style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>{summary.candidate_name || 'Candidate'}</div>
        <div style={{ color: '#aaa', fontSize: '12px', marginTop: '3px' }}>
          {summary.experience_years ? summary.experience_years + ' years experience' : ''}
          {summary.call_number ? ' \u2022 Call #' + summary.call_number : ''}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
        <SummaryCard title="Key Information" icon={'\u{1F4CB}'} items={summary.key_information_gathered} bgColor="#e8f4f8" borderColor="#17a2b8" textColor="#0c5460" />
        <SummaryCard title="Strengths" icon={'\u{1F4AA}'} items={summary.candidate_strengths} bgColor="#d4edda" borderColor="#28a745" textColor="#155724" />
        <SummaryCard title="Areas for Development" icon={'\u26A0\uFE0F'} items={summary.experience_gaps} bgColor="#fff3cd" borderColor="#ffc107" textColor="#856404" />
        <SummaryCard title="Key Responses" icon={'\u{1F4AC}'} items={summary.responses_to_questions} bgColor="#f8f9fa" borderColor="#6c757d" textColor="#495057" />
        <SummaryCard title="Suggested Follow-ups" icon={'\u2753'} items={summary.follow_up_questions} bgColor="#e7e3ff" borderColor="#6f42c1" textColor="#4a3478" />
        <SummaryCard title="Next Actions" icon={'\u{1F4DD}'} items={summary.next_action_items} bgColor="#e8f4f8" borderColor="#17a2b8" textColor="#0c5460" />
        <SummaryCard title="Red Flags" icon={'\u{1F6A9}'} items={summary.red_flags} bgColor="#f8d7da" borderColor="#dc3545" textColor="#721c24" />
        <SummaryCard title="Green Flags" icon={'\u2705'} items={summary.green_flags} bgColor="#d4edda" borderColor="#28a745" textColor="#155724" />

        {summary.key_quotes_from_candidate?.length > 0 && (
          <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #dee2e6' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#495057', marginBottom: '10px' }}>{'\u{1F4AD}'} Key Quotes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {summary.key_quotes_from_candidate.map((q, i) => (
                <div key={i} style={{ background: '#f8f9fa', padding: '10px 12px', borderRadius: '6px', fontStyle: 'italic', fontSize: '12px', color: '#555', borderLeft: '3px solid #6c757d' }}>
                  &ldquo;{safeRender(q)}&rdquo;
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {(summary.availability || summary.salary_expectations || summary.employment_preference || summary.qualification_assessment) && (
        <div style={{ marginTop: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {summary.availability && <div style={{ background: '#d1ecf1', padding: '8px 15px', borderRadius: '20px', fontSize: '11px', color: '#0c5460' }}>{'\u{1F4C5}'} Availability: {summary.availability}</div>}
          {summary.salary_expectations && <div style={{ background: '#fff3cd', padding: '8px 15px', borderRadius: '20px', fontSize: '11px', color: '#856404' }}>{'\u{1F4B0}'} Salary: {typeof summary.salary_expectations === 'string' ? summary.salary_expectations : safeRender(summary.salary_expectations)}</div>}
          {summary.employment_preference && <div style={{ background: '#e8f4f8', padding: '8px 15px', borderRadius: '20px', fontSize: '11px', color: '#16213e' }}>{'\u{1F4BC}'} Employment: {typeof summary.employment_preference === 'string' ? summary.employment_preference : safeRender(summary.employment_preference)}</div>}
          {summary.qualification_assessment && <div style={{ background: '#e7e3ff', padding: '8px 15px', borderRadius: '20px', fontSize: '11px', color: '#4a3478' }}>{'\u{1F3AF}'} Assessment: {formatQualification(summary.qualification_assessment)}</div>}
        </div>
      )}
    </div>
  );
};

// --- Main UserSearchResult Component ---
const UserSearchResult = ({ data, onBack, onSearchById, onUserUpdated, userEmail }) => {
  const [activeSection, setActiveSection] = useState('calls');

  // Handle multiple matches (not found, but multiple_matches)
  if (!data.found) {
    if (data.multiple_matches) {
      const p = data.pagination || {};
      return (
        <div className="table-wrapper">
          <div style={{ padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' }}>
            <h3 style={{ margin: 0 }}>{'\u{1F50D}'} {p.total_count || data.matches.length} Users Found - Select One</h3>
            <span style={{ color: '#666', fontSize: '12px' }}>{data.message || ''}</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>WhatsApp</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.matches.map((m, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{m.name || '-'}</td>
                    <td style={{ fontSize: '11px' }}>{m.email || '-'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{m.phone_number || '-'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{m.whatsapp_number || '-'}</td>
                    <td><span style={{ background: '#e8f4f8', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>{m.status || '-'}</span></td>
                    <td style={{ fontSize: '11px', color: '#666' }}>{m.created_at ? new Date(m.created_at).toLocaleDateString('en-IN') : '-'}</td>
                    <td><button className="btn btn-sm btn-primary" onClick={() => onSearchById(m.id)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.total_pages > 1 && (
            <div style={{ padding: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', borderTop: '1px solid #eee' }}>
              <button className="btn btn-sm btn-secondary" disabled={p.current_page === 1} onClick={() => onSearchById(null, 1)}>&laquo; First</button>
              <button className="btn btn-sm btn-secondary" disabled={!p.has_prev} onClick={() => onSearchById(null, p.current_page - 1)}>&lsaquo; Prev</button>
              <span style={{ padding: '0 15px', fontSize: '13px' }}>
                Page <strong>{p.current_page}</strong> of <strong>{p.total_pages}</strong>
                <span style={{ color: '#888', marginLeft: '10px' }}>({p.total_count} total)</span>
              </span>
              <button className="btn btn-sm btn-secondary" disabled={!p.has_next} onClick={() => onSearchById(null, p.current_page + 1)}>Next &rsaquo;</button>
              <button className="btn btn-sm btn-secondary" disabled={p.current_page === p.total_pages} onClick={() => onSearchById(null, p.total_pages)}>Last &raquo;</button>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="table-wrapper" style={{ padding: '20px' }}>
        <button className="btn btn-secondary" onClick={onBack} style={{ marginBottom: '15px' }}>&larr; Back to User List</button>
        <div className="ready-state">{data.message || 'User not found'}</div>
      </div>
    );
  }

  const u = data.user;
  const m = data.key_metrics || {};
  const userFlags = getUserFlags(u);

  const sections = [
    { id: 'screening', label: `Screening (${data.screening_count || 0})` },
    { id: 'calls', label: `Calls (${data.conversations_count || 0})` },
    { id: 'whatsapp', label: `WhatsApp (${data.whatsapp_count || 0})` },
    { id: 'matches', label: `Job Matches (${data.matches_count || 0})` },
    { id: 'interested', label: `Interested Jobs (${data.interested_count || 0})` },
    { id: 'cv', label: 'Generated CV' },
    { id: 'summary', label: 'AI Summary' }
  ];

  return (
    <div>
      {/* Back Button */}
      <div style={{ marginBottom: '10px' }}>
        <button className="btn btn-secondary" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          &larr; Back to User List
        </button>
      </div>

      {/* Key Metrics Bar */}
      <div className="table-wrapper" style={{ marginBottom: '15px', background: 'linear-gradient(135deg, #16213e 0%, #1a1a2e 100%)' }}>
        <div style={{ padding: '15px 20px', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h3 style={{ margin: 0, color: '#fff', fontSize: '20px' }}>{u.name || 'Unknown'}</h3>
            <div style={{ color: '#aaa', fontSize: '12px', marginTop: '3px' }}>{m.role || '-'} at {m.company || '-'}</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
            <MetricBadge label={'\u{1F4CD} Location'} value={m.location} />
            <MetricBadge label={'\u{1F4BC} Experience'} value={m.experience_years ? m.experience_years + ' yrs' : null} />
            <MetricBadge label={'\u{1F4B0} CTC'} value={m.current_ctc} />
            <MetricBadge label={'\u{1F4C8} Expected'} value={m.expected_ctc} />
            <MetricBadge label={'\u23F0 Notice'} value={m.notice_period} />
            {m.referred_by_code && <MetricBadge label={'\u{1F517} Referred By'} value={m.referred_by_code} />}
            {m.referral_code && <MetricBadge label={'\u{1F3AB} My Ref Code'} value={m.referral_code} />}
          </div>
        </div>
      </div>

      {/* User Profile Card */}
      <div className="table-wrapper" style={{ marginBottom: '20px' }}>
        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {/* Contact & Status */}
          <div>
            <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Contact & Status</h4>
            <div style={{ display: 'grid', gap: '8px', fontSize: '12px' }}>
              <div><strong>User ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{u.id}</span></div>
              <div><strong>Email:</strong> {u.email || '-'}</div>
              <div><strong>Phone:</strong> {u.phone_number || '-'}</div>
              <div><strong>WhatsApp:</strong> {u.whatsapp_number || '-'}</div>
              <div><strong>Status:</strong> <span style={{ background: '#e8f4f8', padding: '2px 8px', borderRadius: '4px' }}>{u.status || '-'}</span></div>
              <div><strong>Created:</strong> {formatDate(u.created_at)}</div>
            </div>
            <UserFlags flags={userFlags} />
          </div>

          {/* Profile & CV */}
          <div>
            <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Profile & CV</h4>
            <div style={{ display: 'grid', gap: '8px', fontSize: '12px' }}>
              <div><strong>Profile:</strong> <span style={{ color: u.profile_completion_per >= 80 ? '#00b894' : '#f39c12', fontWeight: 600 }}>{u.profile_completion_per || 0}% complete</span></div>
              <div><strong>LinkedIn:</strong> {u.linkedin_url ? <a href={u.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0077b5' }}>View Profile</a> : '-'}</div>
              <div><strong>CV File:</strong> {u.cv_file_url ? <a href={u.cv_file_url} target="_blank" rel="noopener noreferrer" style={{ color: '#e94560' }}>Download</a> : '-'}</div>
              <div><strong>CV Generated:</strong> {formatDate(u.cv_generated_at)}</div>
              <div><strong>Relocation:</strong> {m.relocation || '-'}</div>
            </div>
          </div>

          {/* Call Stats */}
          <div>
            <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Call Stats</h4>
            <div style={{ display: 'grid', gap: '8px', fontSize: '12px' }}>
              <div><strong>Total Calls:</strong> {u.total_calls || 0}</div>
              <div><strong>Successful:</strong> <span style={{ color: '#00b894' }}>{u.successful_calls || 0}</span></div>
              <div><strong>Total Duration:</strong> {formatDuration(u.total_call_duration_secs)}</div>
              <div><strong>Last Call:</strong> {formatDate(u.last_call_at)}</div>
            </div>
          </div>

          {/* Job Matching */}
          <div>
            <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Job Matching</h4>
            <div style={{ display: 'grid', gap: '8px', fontSize: '12px' }}>
              <div><strong>Status:</strong> {u.matching_status || '-'}</div>
              <div><strong>JDs Evaluated:</strong> {u.jds_evaluated_count || 0}</div>
              <div><strong>Matches:</strong> {u.cumulative_matches_count || 0} <span style={{ color: '#e94560' }}>(Best: {u.best_match_score || '-'})</span></div>
              <div><strong>Interested:</strong> <span style={{ color: '#00b894', fontWeight: 600 }}>{u.jobs_interested_count || 0} jobs</span></div>
            </div>
          </div>

          {/* Recruiter Info */}
          <div>
            <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Recruiter Info</h4>
            <div style={{ display: 'grid', gap: '8px', fontSize: '12px' }}>
              <div><strong>Recruiter:</strong> {u.recruiter_email || '-'}</div>
              <div><strong>Team Manager:</strong> {u.team_manager_email || '-'}</div>
              <div><strong>Data Tag:</strong> {u.data_team_tag || '-'}</div>
              <div><strong>Team Role Code:</strong> <span style={{ color: '#6c5ce7', fontWeight: 600 }}>{u.team_role_code || '-'}</span></div>
              <div><strong>BoB Role Code:</strong> <span style={{ color: '#0984e3', fontWeight: 600 }}>{u.system_role_code || '-'}</span></div>
              <div><strong>Qual. Timestamp:</strong> <span style={{ color: '#555', fontWeight: 600 }}>{u.qualification_timestamp ? new Date(u.qualification_timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '-'}</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>Feedback:</strong>
                <FeedbackUpdater
                  userId={u.id}
                  currentStatus={u.recruiter_feedback_status}
                  userEmail={userEmail}
                  onUpdated={(uid, newStatus, newComments) => {
                    u.recruiter_feedback_status = newStatus;
                    if (newComments !== undefined) u.recruiter_comments = newComments;
                    if (onUserUpdated) onUserUpdated(uid, { feedback_status: newStatus, recruiter_comments: newComments });
                  }}
                />
              </div>
              <CommentsEditor
                userId={u.id}
                currentComments={u.recruiter_comments}
                onUpdated={(uid, newComments) => {
                  u.recruiter_comments = newComments;
                  if (onUserUpdated) onUserUpdated(uid, { recruiter_comments: newComments });
                }}
              />
            </div>
          </div>

          {/* WhatsApp Stats */}
          <div>
            <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>WhatsApp Stats</h4>
            <div style={{ display: 'grid', gap: '8px', fontSize: '12px' }}>
              <div><strong>Messages:</strong> {u.whatsapp_message_count || 0}</div>
              <div><strong>Last Inbound:</strong> {formatDate(u.whatsapp_last_inbound_at)}</div>
              <div><strong>Last Outbound:</strong> {formatDate(u.whatsapp_last_outbound_at)}</div>
            </div>
          </div>

          {/* Journey Timeline */}
          <div style={{ gridColumn: '1 / -1' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Journey Timeline</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '11px' }}>
              {[
                { label: 'Created', ts: u.created_at, color: '#636e72' },
                { label: '80+ Profile', ts: u.qual_stage_profile_ts, color: '#6c5ce7' },
                { label: 'Matching Started', ts: u.matching_started_at, color: '#0984e3' },
                { label: 'Matching Completed', ts: u.matching_completed_at, color: '#00cec9' },
                { label: 'Interested (Email Sent)', ts: u.qual_stage_interested_ts, color: '#00b894' },
                { label: 'CV Generated', ts: u.cv_generated_at, color: '#fdcb6e' },
                { label: 'Last Call', ts: u.last_call_at, color: '#e17055' },
              ].map((step, i) => (
                <div key={i} style={{
                  padding: '6px 12px',
                  background: step.ts ? '#f0f4ff' : '#f8f9fa',
                  borderLeft: `3px solid ${step.ts ? step.color : '#ddd'}`,
                  borderRadius: '4px',
                  minWidth: '180px',
                  opacity: step.ts ? 1 : 0.5
                }}>
                  <div style={{ fontWeight: 600, color: step.ts ? step.color : '#999', marginBottom: 2 }}>
                    {step.label}
                  </div>
                  <div style={{ color: '#444' }}>
                    {step.ts ? new Date(step.ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                  </div>
                </div>
              ))}
              {/* Qual. Timestamp highlighted */}
              <div style={{
                padding: '6px 12px',
                background: u.qualification_timestamp ? '#e8f8f5' : '#f8f9fa',
                borderLeft: '3px solid #e94560',
                borderRadius: '4px',
                minWidth: '180px',
                opacity: u.qualification_timestamp ? 1 : 0.5
              }}>
                <div style={{ fontWeight: 700, color: '#e94560', marginBottom: 2 }}>
                  Qual. Timestamp (MIN)
                </div>
                <div style={{ color: '#444', fontWeight: 600 }}>
                  {u.qualification_timestamp ? new Date(u.qualification_timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="subtabs" style={{ marginBottom: '15px' }}>
        {sections.map(s => (
          <button
            key={s.id}
            className={`btn btn-secondary btn-sm ${activeSection === s.id ? 'active' : ''}`}
            onClick={() => setActiveSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Section Content */}
      {activeSection === 'screening' && <ScreeningSection sessions={data.screening_sessions} skills={data.screening_skills} results={data.screening_results} />}
      {activeSection === 'calls' && <CallsSection conversations={data.conversations} />}
      {activeSection === 'whatsapp' && <WhatsAppMessagesSection messages={data.whatsapp_messages} />}
      {activeSection === 'matches' && <MatchesSection matches={data.job_matches} />}
      {activeSection === 'interested' && <InterestedSection jobs={data.interested_jobs} />}
      {activeSection === 'cv' && <GeneratedCVSection cvData={u.generated_cv_text} />}
      {activeSection === 'summary' && <SummarySection user={u} />}
    </div>
  );
};

// Role Search Result Component
const RoleSearchResult = ({ data, onBack, onViewUser, userEmail }) => {
  if (!data.found) {
    return (
      <div className="table-wrapper" style={{ padding: '20px' }}>
        <button className="btn btn-secondary" onClick={onBack} style={{ marginBottom: '15px' }}>&larr; Back</button>
        <div className="ready-state">{data.message || 'Role not found'}</div>
      </div>
    );
  }

  const roles = data.roles || [];
  const matched = data.matched_users || [];
  const interested = data.interested_users || [];

  return (
    <div className="table-wrapper">
      <div style={{ padding: '15px', background: 'linear-gradient(135deg, #16213e 0%, #1a1a2e 100%)', borderRadius: '8px 8px 0 0' }}>
        <h3 style={{ margin: 0, color: '#fff' }}>Role: {roles.map(r => r.name || r.code).join(', ')}</h3>
        <div style={{ color: '#aaa', fontSize: '12px', marginTop: '5px' }}>
          Code: {roles.map(r => r.code).join(', ')} | Matched: {data.matched_count} | Interested: {data.interested_count}
        </div>
      </div>
      <div style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
        <button className="btn btn-secondary" onClick={onBack}>&larr; Back</button>
      </div>

      <div style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
        <h4 style={{ marginBottom: '10px' }}>Matched Profiles ({matched.length})</h4>
        {matched.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>Match Score</th><th>Feedback Status</th><th>Created</th><th>Action</th></tr></thead>
              <tbody>
                {matched.map((u, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{u.name || '-'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{u.phone_number || '-'}</td>
                    <td style={{ textAlign: 'center' }}><span style={{ background: '#28a74520', color: '#28a745', padding: '3px 10px', borderRadius: '12px', fontWeight: 600 }}>{u.matching_score || 0}</span></td>
                    <td style={{ fontSize: '10px' }}><FeedbackUpdater userId={u.user_id} currentStatus={u.feedback_status} userEmail={userEmail} onUpdated={(uid, newStatus) => { u.feedback_status = newStatus; }} /></td>
                    <td style={{ fontSize: '10px', color: '#666' }}>{formatDateShort(u.created_at)}</td>
                    <td><button className="btn btn-sm btn-primary" onClick={() => onViewUser(u.user_id)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ color: '#888', fontSize: '12px' }}>No matched profiles found</div>}
      </div>

      <div style={{ padding: '15px' }}>
        <h4 style={{ marginBottom: '10px' }}>Interested Profiles ({interested.length})</h4>
        {interested.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Profile %</th><th>Feedback Status</th><th>Created</th><th>Action</th></tr></thead>
              <tbody>
                {interested.map((u, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{u.name || '-'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{u.phone_number || '-'}</td>
                    <td style={{ fontSize: '11px' }}>{u.email || '-'}</td>
                    <td style={{ textAlign: 'center' }}><span style={{ background: '#17a2b820', color: '#17a2b8', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{u.profile_completion || 0}%</span></td>
                    <td style={{ fontSize: '10px' }}><FeedbackUpdater userId={u.user_id} currentStatus={u.feedback_status} userEmail={userEmail} onUpdated={(uid, newStatus) => { u.feedback_status = newStatus; }} /></td>
                    <td style={{ fontSize: '10px', color: '#666' }}>{formatDateShort(u.created_at)}</td>
                    <td><button className="btn btn-sm btn-primary" onClick={() => onViewUser(u.user_id)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ color: '#888', fontSize: '12px' }}>No interested profiles found</div>}
      </div>
    </div>
  );
};

// --- Main Tab Component ---
const UserLookupTab = ({ initialUserId, onConsumeUserId, onBack, previousTabLabel, lookupFilters, onConsumeLookupFilters, lockedFilters, userEmail }) => {
  const [filterOptions, setFilterOptions] = useState({});
  const [filters, setFilters] = useState({ recruiter: [], manager: [], dataTag: lockedFilters?.data_team_tag || [], stage: [], feedback: [], qualificationFilter: '' });
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleQuery, setRoleQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [roleResult, setRoleResult] = useState(null);
  const [view, setView] = useState('list');
  const searchQueryRef = useRef('');

  useEffect(() => { loadFilterOptions(); }, []);

  // Auto-search when initialUserId is passed from another tab (e.g. ScreeningTab)
  const initialUserIdRef = useRef(null);
  useEffect(() => {
    if (initialUserId && initialUserId !== initialUserIdRef.current) {
      initialUserIdRef.current = initialUserId;
      searchQueryRef.current = initialUserId;
      setSearchQuery(initialUserId);
      setLoading(true);
      setView('search');
      searchUser(initialUserId, 1).then(result => {
        setSearchResult(result);
        setLoading(false);
      }).catch(() => setLoading(false));
      if (onConsumeUserId) onConsumeUserId();
    }
  }, [initialUserId]);

  // Handle incoming filters from RecruiterSummaryTab navigation
  const lookupFiltersRef = useRef(null);
  useEffect(() => {
    if (lookupFilters && lookupFilters !== lookupFiltersRef.current) {
      lookupFiltersRef.current = lookupFilters;
      // Apply the incoming filters
      const newFilters = {
        recruiter: lookupFilters.recruiterEmail ? [lookupFilters.recruiterEmail] : [],
        manager: [],
        dataTag: lookupFilters.dataTeamTag || [],
        stage: lookupFilters.userStage ? [lookupFilters.userStage] : [],
        feedback: lookupFilters.feedbackStatus ? [lookupFilters.feedbackStatus] : [],
        qualificationFilter: '',
      };
      setFilters(newFilters);
      setDateFrom(lookupFilters.dateFrom || '');
      setDateTo(lookupFilters.dateTo || '');
      setSortBy('created_at');
      setSortDir('desc');
      if (onConsumeLookupFilters) onConsumeLookupFilters();
      // Trigger fetch with these filters after state update
      setTimeout(() => {
        // Build params directly since state may not have updated yet
        setLoading(true);
        setView('list');
        const params = { page: 1, pageSize: 50, sortBy: 'created_at', sortDir: 'desc', dateFrom: lookupFilters.dateFrom || '', dateTo: lookupFilters.dateTo || '' };
        if (lookupFilters.recruiterEmail) params.recruiterEmail = lookupFilters.recruiterEmail;
        if (lookupFilters.dataTeamTag?.length) params.dataTeamTag = lookupFilters.dataTeamTag.join(',');
        if (lookupFilters.userStage) params.userStage = lookupFilters.userStage;
        if (lookupFilters.feedbackStatus) params.feedbackStatus = lookupFilters.feedbackStatus;
        fetchUsersList(params).then(data => {
          setUsers(data.users || []);
          setPagination(data.pagination);
          setLoading(false);
        }).catch(() => setLoading(false));
      }, 0);
    }
  }, [lookupFilters]);

  const loadFilterOptions = async () => {
    try { setFilterOptions(await fetchUserFilterOptions()); }
    catch (err) { console.error('Error loading filter options:', err); }
  };

  const handleApplyFilters = async (page = 1) => {
    setLoading(true);
    setView('list');
    try {
      const params = { page, pageSize: 50, sortBy, sortDir, dateFrom, dateTo };
      const recruiterFilters = filters.recruiter.filter(v => v !== '__NONE__');
      const managerFilters = filters.manager.filter(v => v !== '__NONE__');
      const dataTagFilters = filters.dataTag.filter(v => v !== '__NONE__');
      const stageFilters = filters.stage.filter(v => v !== '__NONE__');
      const feedbackFilters = filters.feedback.filter(v => v !== '__NONE__');
      if (recruiterFilters.length) params.recruiterEmail = recruiterFilters.join(',');
      if (managerFilters.length) params.teamManagerEmail = managerFilters.join(',');
      if (dataTagFilters.length) params.dataTeamTag = dataTagFilters.join(',');
      if (stageFilters.length) params.userStage = stageFilters.join(',');
      if (feedbackFilters.length) params.feedbackStatus = feedbackFilters.join(',');
      if (filters.qualificationFilter) params.qualificationFilter = filters.qualificationFilter;
      const data = await fetchUsersList(params);
      setUsers(data.users || []);
      setPagination(data.pagination);
    } catch (err) { console.error('Error fetching users:', err); }
    setLoading(false);
  };

  const handleSearch = async (query, page = 1) => {
    const q = query || searchQueryRef.current;
    if (!q.trim()) return;
    searchQueryRef.current = q;
    setSearchQuery(q);
    setLoading(true);
    setView('search');
    try { setSearchResult(await searchUser(q, page)); }
    catch (err) { console.error('Error searching user:', err); }
    setLoading(false);
  };

  const handleSearchById = (userId, page) => {
    if (userId) {
      handleSearch(userId, 1);
    } else if (page) {
      handleSearch(searchQueryRef.current, page);
    }
  };

  const handleRoleSearch = async () => {
    if (!roleQuery.trim()) return;
    setLoading(true);
    setView('role');
    try { setRoleResult(await searchByRole(roleQuery)); }
    catch (err) { console.error('Error searching role:', err); }
    setLoading(false);
  };

  // Track user updates from detail view so list stays in sync
  const [removingIds, setRemovingIds] = useState(new Set());

  const handleUserUpdated = (userId, changes) => {
    // Update users list with the changed fields
    setUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const updated = { ...u };
      if (changes.feedback_status !== undefined) updated.feedback_status = changes.feedback_status;
      if (changes.recruiter_comments !== undefined) updated.recruiter_comments = changes.recruiter_comments;
      return updated;
    }));

    // If feedback filter is active and the new status doesn't match, animate removal
    const activeFeedback = filters.feedback.filter(v => v !== '__NONE__');
    if (activeFeedback.length > 0 && changes.feedback_status !== undefined) {
      const newStatus = changes.feedback_status || 'Null';
      const matches = activeFeedback.some(f =>
        f === 'Null' ? !changes.feedback_status : f === newStatus
      );
      if (!matches) {
        setRemovingIds(prev => new Set([...prev, userId]));
        setTimeout(() => {
          setUsers(prev => prev.filter(u => u.id !== userId));
          setRemovingIds(prev => { const next = new Set(prev); next.delete(userId); return next; });
        }, 500);
      }
    }
  };

  const clearFilters = () => {
    setFilters({ recruiter: [], manager: [], dataTag: lockedFilters?.data_team_tag || [], stage: [], feedback: [], qualificationFilter: '' });
    setSortBy('created_at');
    setSortDir('desc');
    setDateFrom('');
    setDateTo('');
  };

  const screeningStatusColors = {
    completed: '#00b894', partial_screening_done: '#fdcb6e', failed: '#e94560',
    pending: '#74b9ff', in_progress: '#a29bfe',
  };
  const screeningOutcomeColors = {
    passed: '#00b894', failed: '#e94560', inconclusive: '#fdcb6e',
    partially_passed: '#ffa502', unknown: '#b2bec3',
  };

  const stageColors = {
    'Screening Passed': '#00b894',
    'Interested': '#0984e3',
    'Match No Interest': '#e17055',
    '80+ No Match': '#636e72',
  };

  const getUserStage = (u) => {
    if (u.screening_outcome === 'passed') return 'Screening Passed';
    if ((u.jobs_interested_count || 0) > 0) return 'Interested';
    if ((u.best_match_score || 0) > 0 && (u.jobs_interested_count || 0) === 0) return 'Match No Interest';
    if ((u.profile_completion || 0) >= 80 && !u.best_match_score) return '80+ No Match';
    return null;
  };

  const userColumns = [
    { key: 'name', label: 'Name', render: (v) => <span style={{ fontWeight: 600 }}>{v || '-'}</span> },
    { key: 'phone_number', label: 'Phone', cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { key: 'recruiter_email', label: 'Recruiter', render: (v) => v ? <span style={{ fontSize: '10px' }}>{v.split('@')[0]}</span> : <span style={{ color: '#ccc' }}>-</span> },
    { key: 'total_call_duration', label: 'Call Dur', render: (v) => formatDuration(v) },
    {
      key: 'profile_completion', label: 'Profile %',
      render: (v) => {
        const pct = v || 0;
        const color = pct >= 80 ? '#28a745' : pct >= 50 ? '#ffc107' : '#dc3545';
        return <span style={{ background: `${color}20`, color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{pct}%</span>;
      }
    },
    {
      key: 'stage', label: 'Stage',
      render: (v, row) => {
        const stage = getUserStage(row);
        if (!stage) return <span style={{ color: '#ccc' }}>-</span>;
        const c = stageColors[stage] || '#636e72';
        return <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: `${c}20`, color: c, whiteSpace: 'nowrap' }}>{stage}</span>;
      }
    },
    { key: 'team_role_code', label: 'Team Role Code', render: (v) => v ? <span style={{ fontSize: '10px', fontWeight: 600 }}>{v}</span> : <span style={{ color: '#ccc' }}>-</span> },
    {
      key: 'system_role_code', label: 'BoB Role Code',
      render: (v) => v ? <span style={{ fontSize: '10px', color: '#0984e3', fontWeight: 600 }}>{v}</span> : <span style={{ color: '#ccc' }}>-</span>
    },
    {
      key: 'screening_status', label: 'Screen Status',
      render: (v) => v ? (
        <span style={{
          padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
          background: `${screeningStatusColors[v] || '#b2bec3'}25`,
          color: screeningStatusColors[v] || '#636e72'
        }}>{v.replace(/_/g, ' ')}</span>
      ) : <span style={{ color: '#ccc' }}>-</span>
    },
    {
      key: 'screening_outcome', label: 'Screen Result',
      render: (v) => v ? (
        <span style={{
          padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
          background: `${screeningOutcomeColors[v] || '#b2bec3'}25`,
          color: screeningOutcomeColors[v] || '#636e72'
        }}>{v}</span>
      ) : <span style={{ color: '#ccc' }}>-</span>
    },
    {
      key: 'overall_score', label: 'Score',
      render: (v) => v != null ? (
        <span style={{
          fontWeight: 600,
          color: v >= 7 ? '#00b894' : v >= 5 ? '#fdcb6e' : '#e94560'
        }}>{v}/10</span>
      ) : <span style={{ color: '#ccc' }}>-</span>
    },
    {
      key: 'deal_breakers_hit', label: 'Issues',
      render: (v) => {
        if (!v || !v.length) return <span style={{ color: '#ccc' }}>-</span>;
        return <span style={{ fontSize: 9, color: '#e94560', fontWeight: 600 }}>{v.length} issue{v.length > 1 ? 's' : ''}</span>;
      }
    },
    {
      key: 'feedback_status', label: 'Feedback',
      render: (v, row) => (
        <FeedbackUpdater
          userId={row.id}
          currentStatus={v}
          userEmail={userEmail}
          onUpdated={(uid, newStatus, newComments) => {
            handleUserUpdated(uid, { feedback_status: newStatus, recruiter_comments: newComments });
          }}
        />
      )
    },
    {
      key: 'recruiter_comments', label: 'Comments',
      render: (v, row) => (
        <CommentsEditor
          userId={row.id}
          currentComments={v}
          compact
          onUpdated={(uid, newComments) => {
            handleUserUpdated(uid, { recruiter_comments: newComments });
          }}
        />
      )
    },
    { key: 'qualification_timestamp', label: 'Qual. Time', render: (v) => v ? <span title={new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}>{new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span> : <span style={{ color: '#ccc' }}>-</span>, cellStyle: { fontSize: '10px', color: '#555' } },
    { key: 'created_at', label: 'Created', render: (v) => v ? new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '-', cellStyle: { fontSize: '10px', color: '#666' } },
    {
      key: 'id', label: 'Action', sortable: false,
      render: (id) => <button className="btn btn-sm btn-primary" onClick={() => handleSearch(id)}>View</button>
    }
  ];

  return (
    <div>
      {/* Back Button - shown when navigated from another tab */}
      {onBack && (
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', marginBottom: 12,
            background: '#f8f9fa', border: '1px solid #ddd', borderRadius: 6,
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#0984e3',
          }}
        >
          &larr; Back to {previousTabLabel || 'previous tab'}
        </button>
      )}

      {/* Search Bars */}
      <div className="table-wrapper" style={{ padding: '15px', marginBottom: '15px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search by name, email, phone, or user ID..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); searchQueryRef.current = e.target.value; }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ padding: '10px 15px', border: '1px solid #ddd', borderRadius: '6px', flex: 1, minWidth: '250px' }}
          />
          <button className="btn btn-primary" onClick={() => handleSearch()}>Search User</button>
          <span style={{ color: '#999' }}>|</span>
          <input
            type="text"
            placeholder="Search by role code (e.g., SK15)"
            value={roleQuery}
            onChange={(e) => setRoleQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRoleSearch()}
            style={{ padding: '10px 15px', border: '1px solid #ddd', borderRadius: '6px', width: '200px' }}
          />
          <button className="btn btn-primary" onClick={handleRoleSearch}>Search Role</button>
        </div>
      </div>

      {/* Filters */}
      <div className="table-wrapper filter-section" style={{ padding: '15px', marginBottom: '15px' }}>
        <h4 style={{ marginBottom: '12px', color: '#16213e' }}>Browse Users with Filters</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <div className="filter-group">
            <label>Recruiter</label>
            <MultiSelect options={filterOptions.recruiters || []} selected={filters.recruiter} onChange={(v) => setFilters({ ...filters, recruiter: v })} placeholder="All Recruiters" allLabel="All Recruiters" />
          </div>
          <div className="filter-group">
            <label>Team Manager</label>
            <MultiSelect options={filterOptions.team_managers || []} selected={filters.manager} onChange={(v) => setFilters({ ...filters, manager: v })} placeholder="All Managers" allLabel="All Managers" />
          </div>
          <div className="filter-group">
            <label>Data Team</label>
            {lockedFilters?.data_team_tag ? (
              <span className="locked-filter-value">{lockedFilters.data_team_tag.join(', ')}</span>
            ) : (
              <MultiSelect options={filterOptions.data_tags || []} selected={filters.dataTag} onChange={(v) => setFilters({ ...filters, dataTag: v })} placeholder="All Tags" allLabel="All Tags" />
            )}
          </div>
          <div className="filter-group">
            <label>User Stage</label>
            <MultiSelect options={filterOptions.user_stages || []} selected={filters.stage} onChange={(v) => setFilters({ ...filters, stage: v })} placeholder="All Stages" allLabel="All Stages" />
          </div>
          <div className="filter-group">
            <label>Feedback Status</label>
            <MultiSelect options={['Null', ...getFeedbackOptions(userEmail)]} selected={filters.feedback} onChange={(v) => setFilters({ ...filters, feedback: v })} placeholder="All Statuses" allLabel="All Statuses" />
          </div>
          <div className="filter-group">
            <label>Qual. Time</label>
            <select value={filters.qualificationFilter} onChange={(e) => setFilters({ ...filters, qualificationFilter: e.target.value })} style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '11px', minWidth: '140px' }}>
              <option value="">All</option>
              <option value="yesterday_before_cutoff">&le; Yesterday 7 PM IST</option>
              <option value="yesterday_after_cutoff">After Yesterday 7 PM IST</option>
              <option value="before_cutoff">&le; Today 7 PM IST</option>
              <option value="after_cutoff">After Today 7 PM IST</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Created From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '11px' }} />
          </div>
          <div className="filter-group">
            <label>Created To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '11px' }} />
          </div>
          <div className="filter-group">
            <label>Sort By</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '11px', minWidth: '140px' }}>
              <option value="created_at">Created Date</option>
              <option value="qualification_timestamp">Qual. Time</option>
              <option value="name">Name</option>
              <option value="total_call_duration_secs">Call Duration</option>
              <option value="profile_completion_per">Profile %</option>
              <option value="screening_score">Screening Score</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Order</label>
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '11px', minWidth: '100px' }}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={() => handleApplyFilters(1)}>Apply Filters</button>
            <button className="btn btn-secondary" onClick={clearFilters}>Clear</button>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="loading">Loading...</div>
      ) : view === 'list' && users.length > 0 ? (
        <DataTable title="Users List" data={users} columns={userColumns} sortable={false} pagination={pagination} onPageChange={handleApplyFilters} filterInput rowClassName={(row) => removingIds.has(row.id) ? 'row-removing' : undefined} />
      ) : view === 'search' && searchResult ? (
        <UserSearchResult data={searchResult} onBack={() => setView('list')} onSearchById={handleSearchById} onUserUpdated={handleUserUpdated} userEmail={userEmail} />
      ) : view === 'role' && roleResult ? (
        <RoleSearchResult data={roleResult} onBack={() => setView('list')} onViewUser={(id) => handleSearch(id)} userEmail={userEmail} />
      ) : (
        <div className="ready-state">
          Use the search box to find a specific user, or use the filters above and click "Apply Filters" to browse users.
        </div>
      )}
    </div>
  );
};

export default UserLookupTab;
