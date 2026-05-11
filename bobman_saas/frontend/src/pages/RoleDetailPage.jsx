import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../utils/api';

const PAGE_SIZE = 8;

export default function RoleDetailPage() {
  const { code } = useParams();
  const [role, setRole] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');
  const [showFullJd, setShowFullJd] = useState(false);

  useEffect(() => {
    api.getRole(code).then((r) => setRole(r.role)).catch((e) => setErr(e.message));
  }, [code]);

  useEffect(() => {
    setLoadingMore(true);
    api.listCandidates(code, limit)
      .then((r) => { setCandidates(r.candidates || []); setTotal(r.total_candidates || 0); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingMore(false));
  }, [code, limit]);

  if (err) return <div className="error-banner">{err}</div>;
  if (!role) return <div className="d-skeleton">Loading role…</div>;

  const jdLines = (role.jd_text || '').split('\n').filter(Boolean);
  const visibleLines = showFullJd ? jdLines : jdLines.slice(0, 14);
  const initials = (n) => (n || '?').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="dashboard-page">
      <Link to="/dashboard" className="d-back">← Back to roles</Link>

      <div className="d-role-hero">
        <div className="d-role-hero-grad" />
        <div className="d-role-hero-content">
          <span className="eyebrow eyebrow-light">Open role</span>
          <h1>{role.role_name}</h1>
          <div className="d-role-hero-meta">
            {role.location && <span>📍 {role.location}</span>}
            {role.experience_range && <span>⏱ {role.experience_range}</span>}
            {role.vendor_rate_per_month && <span>💼 {role.vendor_rate_per_month}</span>}
            {role.contract_duration && <span>📋 {role.contract_duration}</span>}
            {role.working_hours && <span>🕐 {role.working_hours}</span>}
            {role.payroll && <span>💳 {role.payroll}</span>}
          </div>
        </div>
      </div>

      {role.jd_text && (
        <div className="d-jd-card">
          <div className="d-jd-head">
            <h3>About this role</h3>
          </div>
          <pre className="d-jd-text">{visibleLines.join('\n')}</pre>
          {jdLines.length > 14 && (
            <button onClick={() => setShowFullJd(!showFullJd)} className="btn-pill btn-pill-ghost btn-pill-sm">
              {showFullJd ? 'Show less' : 'Read full description'}
            </button>
          )}
        </div>
      )}

      <div className="d-cands-section">
        <div className="d-cands-head">
          <div>
            <h2>Recommended candidates</h2>
            <p className="muted">
              {total > 0
                ? `Showing ${candidates?.length || 0} of ${total} pre-screened candidates for this role.`
                : 'No qualified candidates yet for this role.'}
            </p>
          </div>
        </div>

        <div className="d-cand-grid">
          {(candidates || []).map((c, idx) => (
            <Link
              key={c.id}
              to={`/dashboard/roles/${code}/candidates/${c.id}`}
              className="d-cand-card"
              style={{ '--i': idx }}
            >
              <div className="d-cand-avatar">{initials(c.name)}</div>
              <div className="d-cand-info">
                <h4>{c.name || 'Candidate'}</h4>
                <p className="muted small">Pre-screened · AI fit summary inside</p>
              </div>
              <span className="d-cand-arrow">→</span>
            </Link>
          ))}
        </div>

        {candidates && total > candidates.length && (
          <div className="d-load-more">
            <button
              onClick={() => setLimit(limit + PAGE_SIZE)}
              disabled={loadingMore}
              className="btn-pill btn-pill-ghost btn-pill-lg"
            >
              {loadingMore ? 'Loading…' : `See more candidates (${total - candidates.length} more)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
