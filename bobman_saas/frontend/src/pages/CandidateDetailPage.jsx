import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, API_BASE } from '../utils/api';
import { isShortlisted, toggleShortlist, onShortlistChange } from '../utils/shortlist';
import { isSubmitted, onSubmittedChange } from '../utils/submitted';
import ShortlistDrawer from '../components/ShortlistDrawer';

// Light grammar polish on raw text fields from the backend.
function tidy(text) {
  if (!text) return text;
  let t = String(text).trim();
  if (!t) return '';
  t = t.replace(/\s+([,.;:!?])/g, '$1');
  t = t.replace(/\s{2,}/g, ' ');
  t = t.replace(/\bi\b/g, 'I');
  // Capitalize first letter after sentence end
  t = t.replace(/(^\s*|\.\s+|\?\s+|!\s+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
  if (t.length > 0) t = t[0].toUpperCase() + t.slice(1);
  return t;
}

export default function CandidateDetailPage() {
  const { maskedId } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [, setTick] = useState(0);
  const [audioBlobUrl, setAudioBlobUrl] = useState(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const audioBlobRef = useRef(null);

  useEffect(() => {
    setData(null);
    setAudioBlobUrl(null);
    if (audioBlobRef.current) {
      URL.revokeObjectURL(audioBlobRef.current);
      audioBlobRef.current = null;
    }
    api.getCandidate(maskedId).then(setData).catch((e) => setErr(e.message));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [maskedId]);

  async function loadAudio(conversationId) {
    setAudioLoading(true);
    try {
      const url = api.audioUrl(maskedId, conversationId);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load audio');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      audioBlobRef.current = blobUrl;
      setAudioBlobUrl(blobUrl);
    } catch (e) {
      setErr(e.message);
    } finally {
      setAudioLoading(false);
    }
  }

  useEffect(() => onShortlistChange(() => setTick((x) => x + 1)), []);
  useEffect(() => onSubmittedChange(() => setTick((x) => x + 1)), []);

  if (err && !data) return <div className="dashboard-page"><div className="error-banner">{err}</div></div>;
  if (!data) return <div className="dashboard-page"><div className="d-skeleton">Loading candidate…</div></div>;

  const p = data.profile || {};
  const pi = p.personal_info || {};
  const cur = p.current_role || {};
  const comp = p.compensation || {};
  const sub = isSubmitted(maskedId);
  const on = sub || isShortlisted(maskedId);   // submitted = always shortlisted visually

  const profSummary = tidy(p.professional_summary);
  const pitchText = tidy(data.pitch);

  return (
    <div className="dashboard-page candidate-page">
      <Link to="/" className="d-back">← Back to catalog</Link>

      {/* Hero */}
      <div className="cand-hero anim-fade-up">
        <div className="cand-hero-left">
          <div className="cand-avatar-lg">{data.initials || 'C'}</div>
          <div>
            <h1 className="cand-name">
              {data.masked_name || 'Candidate'}
              {isSubmitted(maskedId) && (
                <span className="submitted-badge lg">✓ Submitted</span>
              )}
            </h1>
            {data.role_name && (
              <p className="cand-role-line">
                Matched against <strong>{data.role_name}</strong>
              </p>
            )}
            <p className="cand-hero-tag">
              <span className="dot-status" /> Pre-screened by Bobman AI · Verified by humans
            </p>
            <div className="cand-quick-meta">
              {pi.current_location && <span>📍 {pi.current_location}</span>}
              {pi.open_to_relocation && <span>✈️ Relocation: {pi.open_to_relocation}</span>}
              {comp.notice_period && <span>📆 Notice: {comp.notice_period}</span>}
            </div>
            {data.other_roles?.length > 0 && (
              <div className="other-roles">
                <span className="other-roles-label">Also a fit for:</span>
                {data.other_roles.slice(0, 4).map((r) => (
                  <Link key={r.masked_id} to={`/c/${r.masked_id}`} className="other-role-chip">
                    {r.role_name}
                  </Link>
                ))}
              </div>
            )}
            <div className="cand-quick-actions">
              <button
                className={`btn-pill ${on ? 'btn-pill-primary' : 'btn-pill-ghost'} btn-pill-sm`}
                onClick={() => { if (!sub) toggleShortlist(maskedId); }}
                disabled={sub}
                title={sub ? 'Already submitted in an inquiry' : ''}
              >
                {sub ? '✓ Submitted' : (on ? '✓ Shortlisted' : '+ Add to shortlist')}
              </button>
            </div>
          </div>
        </div>

        <div className="cand-cta-card">
          <div className="cta-card-title">Like this candidate?</div>
          <p className="muted small">Add to your shortlist and schedule an interview. No upfront cost — pay $10k after you hire.</p>
          <button
            className={`btn-pill ${on ? 'btn-pill-ghost' : 'btn-pill-primary'} btn-block`}
            onClick={() => { if (!sub) toggleShortlist(maskedId); }}
            disabled={sub}
            title={sub ? 'Already submitted in an inquiry' : ''}
          >
            {sub
              ? '✓ Already submitted'
              : (on ? '✓ Already in shortlist' : '+ Add to shortlist')}
          </button>
          <button
            className="btn-pill btn-pill-primary btn-block"
            onClick={() => window.dispatchEvent(new CustomEvent('bc:open-shortlist'))}
          >
            Open shortlist →
          </button>
        </div>
      </div>

      {/* Professional summary — moved ABOVE the AI fit pitch */}
      {profSummary && (
        <div className="cand-pane anim-fade-up" style={{ animationDelay: '0.04s' }}>
          <h3>Professional summary</h3>
          <p className="cand-prose">{profSummary}</p>
        </div>
      )}

      {/* AI Pitch */}
      <div className="cand-pitch anim-fade-up" style={{ animationDelay: '0.06s' }}>
        <div className="cand-pitch-head">
          <span className="cand-ai-badge">
            <span className="ai-pulse" />
            AI fit summary
          </span>
          <h2>Why this candidate is a strong fit</h2>
        </div>
        <p className="cand-pitch-body">{pitchText}</p>
      </div>

      {/* AI candidate insights — full block, only "AI recommendation" verdict removed */}
      {data.ai_summary && (
        <div className="ai-summary anim-fade-up" style={{ animationDelay: '0.08s' }}>
          <div className="ai-summary-head">
            <div>
              <span className="ai-summary-eyebrow">
                <span className="ai-pulse" />
                AI candidate insights
              </span>
              <h2>What our AI agent learned</h2>
            </div>
          </div>

          {data.ai_summary.engagement && (
            <div className="ai-engagement">
              {data.ai_summary.engagement.interest_level && (
                <span className="eng-chip eng-chip-good">
                  💚 Interest: <strong>{data.ai_summary.engagement.interest_level}</strong>
                </span>
              )}
              {data.ai_summary.engagement.communication_style && (
                <span className="eng-chip">
                  💬 Style: <strong>{data.ai_summary.engagement.communication_style}</strong>
                </span>
              )}
              {data.ai_summary.engagement.professionalism && (
                <span className="eng-chip eng-chip-good">
                  ⭐ Professionalism: <strong>{data.ai_summary.engagement.professionalism}</strong>
                </span>
              )}
            </div>
          )}

          {(data.ai_summary.key_information?.length > 0 || data.ai_summary.strengths?.length > 0) && (
            <div className="ai-cols">
              {data.ai_summary.key_information?.length > 0 && (
                <div className="ai-col">
                  <h4><span className="ai-col-icon">🔍</span> What we learned</h4>
                  <ul className="ai-list">
                    {data.ai_summary.key_information.map((s, i) => (
                      <li key={i} style={{ animationDelay: `${0.05 * i}s` }}>{tidy(s)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {data.ai_summary.strengths?.length > 0 && (
                <div className="ai-col">
                  <h4><span className="ai-col-icon">💪</span> Standout strengths</h4>
                  <ul className="ai-list ai-list-strong">
                    {data.ai_summary.strengths.map((s, i) => (
                      <li key={i} style={{ animationDelay: `${0.05 * i}s` }}>{tidy(s)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {data.ai_summary.key_quotes?.length > 0 && (
            <div className="ai-quotes">
              <h4>In their own words</h4>
              <div className="ai-quote-grid">
                {data.ai_summary.key_quotes.map((q, i) => (
                  <blockquote key={i} className="ai-quote">"{tidy(q)}"</blockquote>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats row — current/expected/notice only (no screening calls) */}
      {(comp.current_ctc || comp.expected_ctc || comp.notice_period) && (
        <div className="stats-row anim-fade-up" style={{ animationDelay: '0.1s' }}>
          {comp.current_ctc && (
            <div className="stat-tile">
              <span className="stat-tile-icon">💼</span>
              <div>
                <div className="stat-tile-label">Current compensation</div>
                <div className="stat-tile-value">{comp.current_ctc}</div>
              </div>
            </div>
          )}
          {comp.expected_ctc && (
            <div className="stat-tile">
              <span className="stat-tile-icon">🎯</span>
              <div>
                <div className="stat-tile-label">Expected compensation</div>
                <div className="stat-tile-value">{comp.expected_ctc}</div>
              </div>
            </div>
          )}
          {comp.notice_period && (
            <div className="stat-tile">
              <span className="stat-tile-icon">📆</span>
              <div>
                <div className="stat-tile-label">Notice period</div>
                <div className="stat-tile-value">{comp.notice_period}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Key strengths */}
      {data.match?.key_strengths?.length > 0 && (
        <div className="cand-pane pane-green anim-fade-up" style={{ animationDelay: '0.18s' }}>
          <h3>Key strengths</h3>
          <ul className="cand-list">
            {data.match.key_strengths.map((s, i) => (
              <li key={i}><span className="bullet">✓</span><span>{tidy(s)}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* Skills */}
      {p.skills?.length > 0 && (
        <div className="cand-pane anim-fade-up" style={{ animationDelay: '0.22s' }}>
          <h3>Skills &amp; tools</h3>
          <div className="skill-cloud">
            {p.skills.map((s, i) => (
              <span key={i} className="skill-chip" style={{ animationDelay: `${0.02 * i}s` }}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Work history */}
      {p.work_history?.length > 0 && (
        <div className="cand-pane anim-fade-up" style={{ animationDelay: '0.25s' }}>
          <h3>Work history</h3>
          <div className="timeline">
            {p.work_history.map((w, i) => (
              <div key={i} className="timeline-item">
                <span className="timeline-dot" />
                <div className="timeline-content">
                  <div className="timeline-head">
                    <h4>{w.role || 'Role'}</h4>
                    <span className="timeline-meta">{w.duration || ''}</span>
                  </div>
                  {w.company && <div className="timeline-company">{w.company}</div>}
                  {w.responsibilities?.length > 0 && (
                    <ul className="timeline-resp">
                      {w.responsibilities.map((r, j) => <li key={j}>{tidy(r)}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {p.education?.length > 0 && (
        <div className="cand-pane anim-fade-up" style={{ animationDelay: '0.28s' }}>
          <h3>Education</h3>
          <div className="edu-grid">
            {p.education.map((e, i) => (
              <div key={i} className="edu-card">
                <div className="edu-degree">{e.degree || 'Degree'}</div>
                {e.institution && <div className="edu-inst">{e.institution}</div>}
                {e.year && <div className="edu-year">{e.year}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer CTA */}
      <div className="cand-foot">
        <button
          className="btn-pill btn-pill-primary btn-pill-lg"
          onClick={() => window.dispatchEvent(new CustomEvent('bc:open-shortlist'))}
        >
          Open shortlist <span className="arrow">→</span>
        </button>
      </div>

      <ShortlistDrawer />
    </div>
  );
}
