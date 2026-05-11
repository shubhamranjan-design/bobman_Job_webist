import { useState, useMemo, useEffect } from 'react';
import MultiSelect from './MultiSelect';
import FeedbackUpdater from './FeedbackUpdater';

const SCREENING_STORAGE_KEY = 'screening_filters';

const loadScreeningFilters = () => {
  try {
    const raw = sessionStorage.getItem(SCREENING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const formatDuration = (secs) => {
  if (!secs) return '-';
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return mins > 0 ? `${mins}m ${s}s` : `${s}s`;
};

const statusColors = {
  completed: '#00b894',
  partial_screening_done: '#fdcb6e',
  failed: '#e94560',
  pending: '#74b9ff',
  in_progress: '#a29bfe',
};

const outcomeColors = {
  passed: '#00b894',
  failed: '#e94560',
  inconclusive: '#fdcb6e',
  partially_passed: '#ffa502',
  unknown: '#b2bec3',
};

const categoryLabels = {
  ctc: 'CTC', notice_period: 'Notice Period', location: 'Location',
  relocation: 'Relocation', experience: 'Experience', education: 'Education',
  contract_type: 'Contract Type', skills_present: 'Skills (Present)',
  skills_absent: 'Skills (Absent)',
};

// Parse verbose deal_breakers_hit strings into concise grouped summary
// e.g. ["ctc", "critical_skill_failed: MongoDB scored 4/10...", "critical_skill_failed: EKS scored 0/10..."]
// → [{ label: "CTC", count: 1 }, { label: "Skill Fails", count: 2 }]
const summarizeDealBreakers = (dealBreakers) => {
  if (!dealBreakers?.length) return [];
  const groups = {};
  for (const db of dealBreakers) {
    const prefix = db.split(':')[0].trim().toLowerCase();
    if (prefix === 'critical_skill_failed') {
      groups['Skill Fail'] = (groups['Skill Fail'] || 0) + 1;
    } else if (prefix === 'skills_present' || prefix === 'skills_absent') {
      groups['Low Skill Score'] = (groups['Low Skill Score'] || 0) + 1;
    } else {
      // Simple category like "ctc", "relocation", "notice_period"
      const label = categoryLabels[prefix] || prefix.replace(/_/g, ' ');
      groups[label] = (groups[label] || 0) + 1;
    }
  }
  return Object.entries(groups).map(([label, count]) => ({ label, count }));
};

const ScreeningTab = ({ data, onSelectUser, userEmail }) => {
  const savedFilters = loadScreeningFilters();
  const [expandedSession, setExpandedSession] = useState(null);
  const [sortBy, setSortBy] = useState(savedFilters?.sortBy || 'created_at');
  const [sortDir, setSortDir] = useState(savedFilters?.sortDir || 'desc');
  const [filterOutcome, setFilterOutcome] = useState(savedFilters?.filterOutcome || []);
  const [filterStatus, setFilterStatus] = useState(savedFilters?.filterStatus || []);
  const [filterFeedback, setFilterFeedback] = useState(savedFilters?.filterFeedback || []);
  const [viewLevel, setViewLevel] = useState(savedFilters?.viewLevel || 'candidate');

  // Persist screening filters to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(SCREENING_STORAGE_KEY, JSON.stringify({
        sortBy, sortDir, filterOutcome, filterStatus, filterFeedback, viewLevel
      }));
    } catch {}
  }, [sortBy, sortDir, filterOutcome, filterStatus, filterFeedback, viewLevel]);

  if (!data) {
    return <div className="loading">Loading screening data...</div>;
  }

  const { summary, sessions, outcome_vs_feedback, by_role, skill_stats } = data;

  // Deduplicate sessions to unique candidates (keep latest session per candidate)
  const candidateSessions = useMemo(() => {
    const byCandidate = {};
    for (const s of sessions) {
      const cid = s.candidate_id;
      if (!byCandidate[cid]) {
        byCandidate[cid] = { ...s, sessions_count: 1 };
      } else {
        byCandidate[cid].sessions_count++;
        // Keep the latest session (by created_at)
        if ((s.created_at || '') > (byCandidate[cid].created_at || '')) {
          const count = byCandidate[cid].sessions_count;
          byCandidate[cid] = { ...s, sessions_count: count };
        }
      }
    }
    return Object.values(byCandidate);
  }, [sessions]);

  // Compute candidate-level summary stats
  const candidateSummary = useMemo(() => {
    const cs = candidateSessions;
    const completed = cs.filter(s => s.screening_status === 'completed').length;
    const partial = cs.filter(s => s.screening_status === 'partial_screening_done').length;
    const failed = cs.filter(s => s.screening_status === 'failed').length;
    const pending = cs.filter(s => s.screening_status === 'pending' || s.screening_status === 'in_progress').length;
    const passed = cs.filter(s => s.screening_outcome === 'passed').length;
    const scores = cs.filter(s => s.overall_score != null).map(s => s.overall_score);
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
    const durations = cs.filter(s => s.call_duration_secs).map(s => s.call_duration_secs);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const outcomes = {};
    cs.forEach(s => {
      const o = s.screening_outcome || 'unknown';
      outcomes[o] = (outcomes[o] || 0) + 1;
    });
    return {
      total_sessions: cs.length,
      unique_candidates: cs.length,
      completed, partial, failed, pending,
      pass_rate: cs.length > 0 ? ((passed / cs.length) * 100).toFixed(1) : 0,
      avg_score: avgScore,
      avg_duration_secs: avgDuration,
      outcomes,
    };
  }, [candidateSessions]);

  const activeSessions = viewLevel === 'candidate' ? candidateSessions : sessions;
  const activeSummary = viewLevel === 'candidate' ? candidateSummary : summary;

  // Build unique filter options from data
  const outcomeOptions = useMemo(() => [...new Set(activeSessions.map(s => s.screening_outcome).filter(Boolean))].sort(), [activeSessions]);
  const statusOptions = useMemo(() => [...new Set(activeSessions.map(s => s.screening_status).filter(Boolean))].sort(), [activeSessions]);
  const feedbackOptions = useMemo(() => {
    const opts = [...new Set(activeSessions.map(s => s.recruiter_feedback_status).filter(Boolean))].sort();
    if (activeSessions.some(s => !s.recruiter_feedback_status)) {
      opts.unshift('No Feedback');
    }
    return opts;
  }, [activeSessions]);

  // Sorting
  const sortedSessions = [...activeSessions].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    const aNull = aVal == null || aVal === '';
    const bNull = bVal == null || bVal === '';
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    if (typeof aVal === 'string') {
      return sortDir === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    }
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  // Filtering (empty array = all, __NONE__ = select none)
  const activeOutcomes = filterOutcome.filter(v => v !== '__NONE__');
  const activeStatuses = filterStatus.filter(v => v !== '__NONE__');
  const activeFeedbacks = filterFeedback.filter(v => v !== '__NONE__');

  const filteredSessions = sortedSessions.filter(s => {
    if (activeOutcomes.length > 0 && !activeOutcomes.includes(s.screening_outcome)) return false;
    if (activeStatuses.length > 0 && !activeStatuses.includes(s.screening_status)) return false;
    if (activeFeedbacks.length > 0) {
      const hasFeedback = s.recruiter_feedback_status;
      const wantsNoFeedback = activeFeedbacks.includes('No Feedback');
      const wantsSpecific = activeFeedbacks.filter(f => f !== 'No Feedback');
      if (wantsNoFeedback && !hasFeedback) { /* matches */ }
      else if (wantsSpecific.length > 0 && wantsSpecific.includes(hasFeedback)) { /* matches */ }
      else return false;
    }
    return true;
  });

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const sortIcon = (col) => {
    if (sortBy !== col) return '';
    return sortDir === 'desc' ? ' ▼' : ' ▲';
  };

  // Outcome vs Feedback matrix - recomputed from activeSessions so it respects candidate/session toggle
  const activeOutcomeVsFeedback = useMemo(() => {
    const matrix = {};
    for (const s of activeSessions) {
      const outcome = s.screening_outcome || 'unknown';
      const feedback = s.recruiter_feedback_status || 'No Feedback';
      if (!matrix[outcome]) matrix[outcome] = {};
      matrix[outcome][feedback] = (matrix[outcome][feedback] || 0) + 1;
    }
    return matrix;
  }, [activeSessions]);

  const allOutcomes = Object.keys(activeOutcomeVsFeedback);
  const allFeedbacks = new Set();
  allOutcomes.forEach(o => {
    Object.keys(activeOutcomeVsFeedback[o]).forEach(f => allFeedbacks.add(f));
  });
  const feedbackList = Array.from(allFeedbacks).sort();

  return (
    <div>
      {/* View Level Toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f0f0f0', borderRadius: 8, padding: 3, width: 'fit-content' }}>
        <button
          onClick={() => setViewLevel('candidate')}
          style={{
            padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: viewLevel === 'candidate' ? '#16213e' : 'transparent',
            color: viewLevel === 'candidate' ? '#fff' : '#666',
          }}
        >
          Unique Candidates
        </button>
        <button
          onClick={() => setViewLevel('session')}
          style={{
            padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: viewLevel === 'session' ? '#16213e' : 'transparent',
            color: viewLevel === 'session' ? '#fff' : '#666',
          }}
        >
          All Sessions
        </button>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="value" style={{ color: '#16213e' }}>{activeSummary.total_sessions}</div>
          <div className="label">{viewLevel === 'candidate' ? 'CANDIDATES' : 'TOTAL SESSIONS'}</div>
        </div>
        {viewLevel === 'session' && (
          <div className="stat-card">
            <div className="value" style={{ color: '#16213e' }}>{activeSummary.unique_candidates}</div>
            <div className="label">UNIQUE CANDIDATES</div>
          </div>
        )}
        <div className="stat-card">
          <div className="value" style={{ color: '#00b894' }}>{activeSummary.completed}</div>
          <div className="label">COMPLETED</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: '#fdcb6e' }}>{activeSummary.partial}</div>
          <div className="label">PARTIAL</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: '#e94560' }}>{activeSummary.failed}</div>
          <div className="label">FAILED</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: '#74b9ff' }}>{activeSummary.pending}</div>
          <div className="label">PENDING</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: '#00b894' }}>{activeSummary.pass_rate}%</div>
          <div className="label">PASS RATE</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: '#16213e' }}>{activeSummary.avg_score || '-'}</div>
          <div className="label">AVG SCORE</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: '#16213e' }}>{formatDuration(activeSummary.avg_duration_secs)}</div>
          <div className="label">AVG DURATION</div>
        </div>
      </div>

      {/* Outcome Distribution */}
      <div className="table-wrapper" style={{ marginBottom: 20, padding: 15 }}>
        <h3 style={{ margin: '0 0 10px' }}>Outcome Distribution</h3>
        <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap' }}>
          {Object.entries(activeSummary.outcomes).map(([outcome, count]) => (
            <div key={outcome} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6,
              background: `${outcomeColors[outcome] || '#b2bec3'}20`,
              border: `1px solid ${outcomeColors[outcome] || '#b2bec3'}40`
            }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: outcomeColors[outcome] || '#b2bec3'
              }}></span>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{outcome}</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sessions Table */}
      <div className="table-wrapper">
        <div className="table-header">
          <h3 style={{ margin: 0 }}>{viewLevel === 'candidate' ? 'Candidates' : 'Screening Sessions'} ({filteredSessions.length})</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="filter-group" style={{ position: 'relative', zIndex: 30 }}>
              <label style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, display: 'block' }}>Outcome</label>
              <MultiSelect
                options={outcomeOptions}
                selected={filterOutcome}
                onChange={setFilterOutcome}
                placeholder="All Outcomes"
                allLabel="All"
              />
            </div>
            <div className="filter-group" style={{ position: 'relative', zIndex: 20 }}>
              <label style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, display: 'block' }}>Status</label>
              <MultiSelect
                options={statusOptions}
                selected={filterStatus}
                onChange={setFilterStatus}
                placeholder="All Statuses"
                allLabel="All"
              />
            </div>
            <div className="filter-group" style={{ position: 'relative', zIndex: 10 }}>
              <label style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, display: 'block' }}>Feedback</label>
              <MultiSelect
                options={feedbackOptions}
                selected={filterFeedback}
                onChange={setFilterFeedback}
                placeholder="All Feedback"
                allLabel="All"
              />
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('candidate_name')}>
                  Candidate{sortIcon('candidate_name')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('phone_number')}>
                  Phone{sortIcon('phone_number')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('recruiter_email')}>
                  Recruiter{sortIcon('recruiter_email')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('role_code')}>
                  Role{sortIcon('role_code')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('screening_status')}>
                  Status{sortIcon('screening_status')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('screening_outcome')}>
                  Outcome{sortIcon('screening_outcome')}
                </th>
                <th style={{ textAlign: 'left', minWidth: 180 }}>Issue / Reason</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('overall_score')}>
                  Score{sortIcon('overall_score')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('completion_percentage')}>
                  Complete %{sortIcon('completion_percentage')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('call_duration_secs')}>
                  Duration{sortIcon('call_duration_secs')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('recruiter_feedback_status')}>
                  Feedback{sortIcon('recruiter_feedback_status')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                  Date{sortIcon('created_at')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map(s => {
                const dbSummary = summarizeDealBreakers(s.deal_breakers_hit);
                const failedCatNames = (s.failed_categories || []).map(c => categoryLabels[c.category] || c.category);
                const hasIssues = dbSummary.length > 0 || failedCatNames.length > 0 || (s.parts_missing?.length > 0);
                const isExpanded = expandedSession === s.id;

                return (
                <>
                  <tr key={s.id}
                    onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>
                      <span
                        onClick={(e) => { e.stopPropagation(); onSelectUser && onSelectUser(s.candidate_id); }}
                        style={{ color: '#0984e3', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {s.candidate_name}
                      </span>
                      {viewLevel === 'session' && s.session_number > 1 && <span style={{ fontSize: 9, color: '#999', marginLeft: 4 }}>#{s.session_number}</span>}
                      {viewLevel === 'candidate' && s.sessions_count > 1 && <span style={{ fontSize: 8, color: '#0984e3', marginLeft: 4, background: '#0984e315', padding: '1px 4px', borderRadius: 3 }}>{s.sessions_count} sessions</span>}
                    </td>
                    <td style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{s.phone_number || '-'}</td>
                    <td style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{s.recruiter_email ? s.recruiter_email.split('@')[0] : '-'}</td>
                    <td style={{ fontSize: 10 }}>{s.role_code || '-'}</td>
                    <td>
                      <span style={{
                        padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                        background: `${statusColors[s.screening_status] || '#b2bec3'}25`,
                        color: statusColors[s.screening_status] || '#636e72'
                      }}>
                        {s.screening_status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                        background: `${outcomeColors[s.screening_outcome] || '#b2bec3'}25`,
                        color: outcomeColors[s.screening_outcome] || '#636e72'
                      }}>
                        {s.screening_outcome || '-'}
                      </span>
                    </td>
                    {/* Issue / Reason column - concise summary badges */}
                    <td style={{ textAlign: 'left', fontSize: 10, maxWidth: 220 }}>
                      {dbSummary.length > 0 && (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {dbSummary.map(g => (
                            <span key={g.label} style={{
                              padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700,
                              background: '#e9456020', color: '#e94560', border: '1px solid #e9456040',
                            }}>
                              {g.label}{g.count > 1 ? ` (${g.count})` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                      {failedCatNames.length > 0 && dbSummary.length === 0 && (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {failedCatNames.map(name => (
                            <span key={name} style={{
                              padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600,
                              background: '#fdcb6e20', color: '#e17055', border: '1px solid #fdcb6e40',
                            }}>
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                      {s.parts_missing?.length > 0 && dbSummary.length === 0 && !failedCatNames.length && (
                        <span style={{ color: '#999', fontStyle: 'italic' }}>Incomplete call</span>
                      )}
                      {!hasIssues && s.screening_outcome === 'passed' && (
                        <span style={{ color: '#00b894', fontWeight: 600 }}>All clear</span>
                      )}
                      {!hasIssues && s.screening_outcome !== 'passed' && '-'}
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.overall_score ?? '-'}</td>
                    <td>{s.completion_percentage}%</td>
                    <td>{formatDuration(s.call_duration_secs)}</td>
                    <td style={{ fontSize: 10 }} onClick={(e) => e.stopPropagation()}>
                      <FeedbackUpdater
                        userId={s.candidate_id}
                        currentStatus={s.recruiter_feedback_status}
                        userEmail={userEmail}
                        onUpdated={(uid, newStatus) => {
                          s.recruiter_feedback_status = newStatus;
                        }}
                      />
                    </td>
                    <td style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                      {s.created_at ? s.created_at.split('T')[0] : '-'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${s.id}-detail`}>
                      <td colSpan={12} style={{
                        background: '#f8f9fa', padding: 16, textAlign: 'left',
                      }}>
                        {/* AI Summary */}
                        {s.ai_summary && (
                          <div style={{ fontSize: 11, lineHeight: 1.6, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
                            <strong>AI Summary:</strong> {s.ai_summary}
                          </div>
                        )}

                        {/* Deal Breakers */}
                        {s.deal_breakers_hit?.length > 0 && (
                          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#e9456010', borderRadius: 6, border: '1px solid #e9456030' }}>
                            <strong style={{ color: '#e94560', fontSize: 11, display: 'block', marginBottom: 4 }}>Deal Breakers Hit:</strong>
                            {s.deal_breakers_hit.map((db, i) => {
                              const parts = db.split(':');
                              const prefix = parts[0].trim();
                              const detail = parts.length > 1 ? parts.slice(1).join(':').trim() : '';
                              const label = categoryLabels[prefix.toLowerCase()] || prefix.replace(/_/g, ' ');
                              return (
                                <div key={i} style={{ fontSize: 11, marginBottom: 2, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                                  <span style={{ fontWeight: 700, color: '#e94560', minWidth: 'fit-content' }}>{label}:</span>
                                  <span>{detail || db}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Failed / Discussed Categories Detail */}
                        {(s.screening_results || []).filter(r => r.was_discussed).length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <strong style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>Screening Checks:</strong>
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
                                  {(s.screening_results || [])
                                    .filter(r => r.was_discussed)
                                    .sort((a, b) => {
                                      // Failed first, then passed, then null
                                      if (a.passed === false && b.passed !== false) return -1;
                                      if (a.passed !== false && b.passed === false) return 1;
                                      return 0;
                                    })
                                    .map((r, i) => (
                                    <tr key={i} style={{
                                      background: r.passed === false ? '#e9456008' : 'transparent',
                                      borderBottom: '1px solid #eee'
                                    }}>
                                      <td style={{ padding: '5px 8px', fontWeight: 600, whiteSpace: 'normal', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
                                        {categoryLabels[r.category] || r.category}
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

                        {/* Skill Assessments */}
                        {(s.skill_assessments || []).length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <strong style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>Skill Assessments ({s.skill_assessments.length}):</strong>
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
                                  {s.skill_assessments.map((sk, i) => {
                                    const scoreColor = (sk.deep_dive_score || 0) >= 7 ? '#00b894' :
                                      (sk.deep_dive_score || 0) >= 5 ? '#fdcb6e' : '#e94560';
                                    const importanceColor = sk.importance === 'critical' ? '#e94560' :
                                      sk.importance === 'important' ? '#e17055' : '#636e72';
                                    const levelColors = {
                                      expert: '#00b894', advanced: '#00b894',
                                      intermediate: '#fdcb6e', beginner: '#e94560'
                                    };
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
                            <strong>Next Action:</strong> <span style={{ color: '#0984e3' }}>{s.next_action}</span>
                          </div>
                        )}

                        {/* Session Meta */}
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, color: '#636e72', marginBottom: 8 }}>
                          {s.total_questions_asked != null && <span><strong>Questions Asked:</strong> {s.total_questions_asked}</span>}
                          {s.candidate_engagement && <span><strong>Engagement:</strong> {s.candidate_engagement}</span>}
                        </div>

                        {/* Completeness info */}
                        {s.parts_missing?.length > 0 && (
                          <div style={{ fontSize: 10, color: '#636e72' }}>
                            <strong>Incomplete:</strong> {s.completeness_reason || 'Parts missing'}
                            <span style={{ marginLeft: 6, color: '#e17055' }}>
                              ({s.parts_missing.map(p => p.replace(/_/g, ' ')).join(', ')})
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Outcome vs Feedback Status Matrix */}
      {allOutcomes.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: 20 }}>
          <div className="table-header">
            <h3 style={{ margin: 0 }}>Screening Outcome vs Recruiter Feedback</h3>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Screening Outcome</th>
                  {feedbackList.map(f => (
                    <th key={f} style={{ fontSize: 9 }}>{f}</th>
                  ))}
                  <th style={{ fontWeight: 700 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {allOutcomes.map(outcome => {
                  const row = activeOutcomeVsFeedback[outcome];
                  const total = Object.values(row).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={outcome}>
                      <td style={{
                        fontWeight: 600, textAlign: 'left',
                        color: outcomeColors[outcome] || '#636e72'
                      }}>
                        {outcome}
                      </td>
                      {feedbackList.map(f => (
                        <td key={f} style={{
                          fontWeight: row[f] ? 600 : 400,
                          color: row[f] ? '#16213e' : '#ccc'
                        }}>
                          {row[f] || 0}
                        </td>
                      ))}
                      <td style={{ fontWeight: 700 }}>{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By Role Breakdown */}
      {by_role.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: 20 }}>
          <div className="table-header">
            <h3 style={{ margin: 0 }}>By Role Breakdown</h3>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Role</th>
                  <th>Code</th>
                  <th>Sessions</th>
                  <th>Completed</th>
                  <th>Passed</th>
                  <th>Failed</th>
                  <th>Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {by_role.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, textAlign: 'left' }}>{r.role_name}</td>
                    <td>{r.role_code}</td>
                    <td>{r.sessions}</td>
                    <td>{r.completed}</td>
                    <td style={{ color: r.passed > 0 ? '#00b894' : '#ccc', fontWeight: 600 }}>{r.passed}</td>
                    <td style={{ color: r.failed > 0 ? '#e94560' : '#ccc', fontWeight: 600 }}>{r.failed}</td>
                    <td style={{ fontWeight: 600 }}>{r.avg_score || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Skill Analysis */}
      {skill_stats.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: 20 }}>
          <div className="table-header">
            <h3 style={{ margin: 0 }}>Skill Assessment Analysis</h3>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Skill</th>
                  <th>Importance</th>
                  <th>Assessed</th>
                  <th>Avg Score</th>
                  <th>Advanced+</th>
                  <th>Intermediate</th>
                  <th>Beginner</th>
                </tr>
              </thead>
              <tbody>
                {skill_stats.map((sk, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, textAlign: 'left' }}>{sk.skill_name}</td>
                    <td>
                      <span style={{
                        padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                        background: sk.importance === 'critical' ? '#e9456020' :
                                   sk.importance === 'important' ? '#fdcb6e20' : '#f5f5f5',
                        color: sk.importance === 'critical' ? '#e94560' :
                               sk.importance === 'important' ? '#e17055' : '#636e72'
                      }}>
                        {sk.importance}
                      </span>
                    </td>
                    <td>{sk.count}</td>
                    <td style={{
                      fontWeight: 600,
                      color: sk.avg_score >= 7 ? '#00b894' :
                             sk.avg_score >= 5 ? '#fdcb6e' : '#e94560'
                    }}>
                      {sk.avg_score}/10
                    </td>
                    <td style={{ color: sk.advanced_count > 0 ? '#00b894' : '#ccc' }}>{sk.advanced_count}</td>
                    <td>{sk.intermediate_count}</td>
                    <td style={{ color: sk.beginner_count > 0 ? '#e94560' : '#ccc' }}>{sk.beginner_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreeningTab;
