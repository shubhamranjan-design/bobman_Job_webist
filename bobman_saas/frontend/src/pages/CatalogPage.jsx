import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import {
  getShortlist, isShortlisted, toggleShortlist, onShortlistChange,
} from '../utils/shortlist';
import { getSubmitted, isSubmitted, onSubmittedChange } from '../utils/submitted';
import ShortlistDrawer from '../components/ShortlistDrawer';
import RoleSelect from '../components/RoleSelect';
import SkillsModal from '../components/SkillsModal';
import CountUp from '../components/CountUp';

const PAGE_SIZE = 50;

const EXPERIENCE_OPTIONS = [
  { value: 0, label: 'Any experience' },
  { value: 2, label: '2+ years' },
  { value: 4, label: '4+ years' },
  { value: 6, label: '6+ years' },
  { value: 8, label: '8+ years' },
  { value: 10, label: '10+ years' },
];

const SORT_OPTIONS = [
  { value: 'score_desc', label: 'Best match' },
  { value: 'experience_desc', label: 'Most experience' },
  { value: 'recent', label: 'Recently added' },
];

export default function CatalogPage() {
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filters, setFilters] = useState({
    q: '',
    role_code: '',
    min_experience: 0,
    sort: 'score_desc',
  });
  const [hideShortlisted, setHideShortlisted] = useState(false);
  const [roles, setRoles] = useState([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [shortlist, setShortlist] = useState(getShortlist());
  const [submitted, setSubmitted] = useState(getSubmitted());
  const [skillsModal, setSkillsModal] = useState(null); // { maskedId, skills }
  const debounceRef = useRef(null);

  useEffect(() => onShortlistChange(setShortlist), []);
  useEffect(() => onSubmittedChange(setSubmitted), []);

  useEffect(() => {
    api.getRoles().then((r) => setRoles(r.roles || [])).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setErr('');
      try {
        const params = { limit, offset: 0 };
        if (filters.q.trim()) params.q = filters.q.trim();
        if (filters.role_code) params.role_code = filters.role_code;
        if (filters.min_experience > 0) params.min_experience = filters.min_experience;
        if (filters.sort) params.sort = filters.sort;
        const res = await api.getCatalog(params);
        setItems(res.items || []);
        setTotal(res.total || 0);
      } catch (e) {
        setErr(e.message || 'Failed to load catalog');
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [filters, limit]);

  function scrollToTable() {
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const roleOptions = [
    { value: '', label: 'All roles' },
    ...roles.map((r) => ({ value: r.role_code, label: r.role_name })),
  ];

  // Client-side filter — "Hide shortlisted" also hides already-submitted candidates,
  // since once submitted there's no reason to surface them again.
  const isOff = (id) => shortlist.includes(id) || submitted.includes(id);
  const visibleItems = hideShortlisted
    ? (items || []).filter((c) => !isOff(c.masked_id))
    : (items || []);
  const hiddenCount = (items?.length || 0) - visibleItems.length;

  return (
    <>
      {/* HERO — compact */}
      <section className="catalog-hero">
        <div className="hero-content">
          <h1>
            Hire Robotics Talent <span className="grad">Faster</span>
          </h1>

          {/* 3-step flow */}
          <div className="flow-row">
            <div className="flow-step">
              <span className="flow-num">1</span>
              <div>
                <h4>Shortlist Candidates</h4>
                <p>Filter by role &amp; experience.</p>
              </div>
            </div>
            <span className="flow-arrow">→</span>
            <div className="flow-step">
              <span className="flow-num">2</span>
              <div>
                <h4>We Schedule Interviews</h4>
                <p>We coordinate the rest.</p>
              </div>
            </div>
            <span className="flow-arrow">→</span>
            <div className="flow-step pay">
              <span className="flow-num">$</span>
              <div>
                <h4>Pay $10k after you hire</h4>
                <p>Success-based, no upfront.</p>
              </div>
            </div>
          </div>

          <button className="btn-pill btn-pill-primary btn-pill-lg hero-cta" onClick={scrollToTable}>
            Browse <CountUp value={total} /> matches <span className="arrow">↓</span>
          </button>
        </div>
      </section>

      {/* FILTER BAR */}
      <section id="catalog" className="catalog-filter">
        <div className="catalog-filter-row">
          <div className="d-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text"
              placeholder="Search by skill or role (e.g. perception, SLAM, AI infra)…"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
            {filters.q && (
              <button className="d-search-clear" onClick={() => setFilters((f) => ({ ...f, q: '' }))}>✕</button>
            )}
          </div>
          <RoleSelect
            value={filters.role_code}
            onChange={(v) => setFilters((f) => ({ ...f, role_code: v }))}
            options={roleOptions}
            placeholder="All roles"
          />
          <RoleSelect
            value={filters.min_experience}
            onChange={(v) => setFilters((f) => ({ ...f, min_experience: parseInt(v) || 0 }))}
            options={EXPERIENCE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          />
          <RoleSelect
            value={filters.sort}
            onChange={(v) => setFilters((f) => ({ ...f, sort: v }))}
            options={SORT_OPTIONS}
          />
          <button
            type="button"
            className={`filter-toggle ${hideShortlisted ? 'on' : ''}`}
            onClick={() => setHideShortlisted((v) => !v)}
            title={hideShortlisted ? 'Showing only non-shortlisted' : 'Show all'}
          >
            <span className="filter-toggle-dot" />
            Hide shortlisted
          </button>
        </div>
        <div className="catalog-meta">
          <span className="muted small">
            {loading ? (
              'Loading…'
            ) : hideShortlisted ? (
              <>Showing {visibleItems.length} of <CountUp value={total} /> ({hiddenCount} shortlisted/submitted hidden)</>
            ) : (
              <>Showing {items?.length || 0} of <CountUp value={total} /> match{total !== 1 ? 'es' : ''}</>
            )}
          </span>
          {shortlist.length > 0 && (
            <span className="catalog-shortlist-hint">
              {shortlist.length} in shortlist
            </span>
          )}
        </div>
      </section>

      {err && <div className="error-banner">{err}</div>}

      {/* TABLE */}
      <section className="catalog-table-wrap">
        <table className="catalog-table">
          <colgroup>
            <col className="col-mid" />
            <col className="col-role" />
            <col className="col-exp" />
            <col className="col-skills" />
            <col className="col-loc" />
            <col className="col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Role</th>
              <th>Exp.</th>
              <th>Top skills</th>
              <th>Location</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((c) => {
              const sub = isSubmitted(c.masked_id);
              const on = sub || isShortlisted(c.masked_id);   // submitted = always shortlisted (visually)
              return (
                <tr key={c.masked_id}>
                  <td className="td-mid">
                    <Link to={`/c/${c.masked_id}`} className="cand-cell">
                      <span className="cand-cell-avatar">{c.initials || 'C'}</span>
                      <span className="cand-cell-body">
                        <span className="cand-cell-name">{c.masked_name || 'Candidate'}</span>
                        {submitted.includes(c.masked_id) && (
                          <span className="submitted-badge">✓ Submitted</span>
                        )}
                      </span>
                    </Link>
                  </td>
                  <td className="td-role">
                    <span className="role-pill">{c.role_name}</span>
                  </td>
                  <td className="td-exp">
                    {c.experience_years > 0 ? `${c.experience_years}y` : '—'}
                  </td>
                  <td>
                    <div className="td-skills">
                      {(c.top_skills || []).slice(0, 2).map((s, i) => (
                        <span key={i} className="skill-mini">{s}</span>
                      ))}
                      {(c.skills_count || 0) > 2 && (
                        <button
                          type="button"
                          className="skill-more"
                          onClick={() => setSkillsModal({ maskedName: c.masked_name, skills: c.all_skills || [] })}
                          title={`Show all ${c.skills_count} skills`}
                        >
                          +{(c.skills_count || 0) - 2}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="td-loc muted">{c.location_city || '—'}</td>
                  <td className="td-actions">
                    <div className="td-actions-inner">
                      <Link to={`/c/${c.masked_id}`} className="btn-row btn-row-ghost">View more</Link>
                      <button
                        className={`btn-row ${on ? 'btn-row-on' : 'btn-row-primary'}`}
                        onClick={() => { if (!sub) toggleShortlist(c.masked_id); }}
                        disabled={sub}
                        title={sub ? 'Already submitted in an inquiry' : ''}
                      >
                        {sub ? '✓ Submitted' : (on ? '✓ Shortlisted' : '+ Shortlist')}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && visibleItems.length === 0 && (
              <tr>
                <td colSpan="6" className="td-empty">
                  {hideShortlisted && shortlist.length > 0
                    ? 'All visible candidates are in your shortlist. Toggle "Hide shortlisted" off to see them.'
                    : 'No candidates match your filters. Try clearing them.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {items && total > items.length && (
          <div className="d-load-more">
            <button
              className="btn-pill btn-pill-ghost btn-pill-lg"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              disabled={loading}
            >
              {loading ? 'Loading…' : `Load more (${total - items.length} remaining)`}
            </button>
          </div>
        )}
      </section>

      {skillsModal && (
        <SkillsModal
          maskedName={skillsModal.maskedName}
          skills={skillsModal.skills}
          onClose={() => setSkillsModal(null)}
        />
      )}

      <ShortlistDrawer />
    </>
  );
}
