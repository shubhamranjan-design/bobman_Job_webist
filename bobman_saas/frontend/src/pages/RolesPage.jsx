import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';

function slug(roleCode, roleName) {
  return roleCode; // we keep code in URL but never show it as a label
}

export default function RolesPage() {
  const [allRoles, setAllRoles] = useState(null);
  const [roles, setRoles] = useState(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchedFor, setSearchedFor] = useState('');
  const [err, setErr] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    api.listRoles()
      .then((r) => { setAllRoles(r.roles || []); setRoles(r.roles || []); })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setRoles(allRoles); setSearchedFor(''); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.searchRoles(q);
        setRoles(r.roles || []);
        setSearchedFor(q);
      } catch (e) { setErr(e.message); }
      finally { setSearching(false); }
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [query, allRoles]);

  return (
    <div className="dashboard-page">
      <div className="d-page-head">
        <div>
          <span className="eyebrow">Open requirements</span>
          <h1>Find your next hire</h1>
          <p className="muted">Browse curated, pre-screened candidates for each role. Click a role to see profiles.</p>
        </div>
      </div>

      <div className="d-search-row">
        <div className="d-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            placeholder="Try: computer vision, robotics SDE, perception, SLAM…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && <button onClick={() => setQuery('')} className="d-search-clear" aria-label="Clear">✕</button>}
        </div>
        {searching && <span className="muted small">AI matching…</span>}
        {searchedFor && !searching && (
          <span className="search-pill">Best matches for "<strong>{searchedFor}</strong>"</span>
        )}
      </div>

      {err && <div className="error-banner">{err}</div>}
      {!roles && !err && <div className="d-skeleton">Loading roles…</div>}
      {roles && roles.length === 0 && (
        <div className="d-empty">
          <div className="d-empty-emoji">🤖</div>
          <h3>No roles match your search</h3>
          <p>Try a different keyword or clear the search to see all open roles.</p>
        </div>
      )}

      <div className="d-role-grid">
        {(roles || []).map((r) => (
          <Link key={r.role_code} to={`/dashboard/roles/${slug(r.role_code, r.role_name)}`} className="d-role-card">
            <div className="d-role-card-top">
              <span className="d-positions">{r.candidate_count} candidate{r.candidate_count !== 1 ? 's' : ''} ready</span>
              <span className="d-role-arrow">→</span>
            </div>
            <h3>{r.role_name}</h3>
            <div className="d-role-tags">
              {r.location && <span className="tag">📍 {r.location}</span>}
              {r.experience_range && <span className="tag">⏱ {r.experience_range}</span>}
              {r.contract_duration && <span className="tag">📋 {r.contract_duration}</span>}
            </div>
            <div className="d-role-foot">
              <span className="d-role-rate">{r.vendor_rate_per_month || 'Rate: TBD'}</span>
              <span className="d-role-cta">View candidates</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
