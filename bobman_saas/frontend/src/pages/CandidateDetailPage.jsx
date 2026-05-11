import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, API_BASE, getToken } from '../utils/api';
import { updateCompanyCredits } from '../utils/auth';

export default function CandidateDetailPage() {
  const { code, candidateId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [unlocking, setUnlocking] = useState('');
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
    api.getCandidate(candidateId, code).then(setData).catch((e) => setErr(e.message));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [candidateId, code]);

  async function handleUnlock(field) {
    setUnlocking(field);
    setErr('');
    try {
      const r = await api.unlock(candidateId, field);
      updateCompanyCredits(r.credits_remaining);
      setData((d) => ({
        ...d,
        [field === 'phone' ? 'phone_number' : 'email']: r.value,
        [field === 'phone' ? 'phone_unlocked' : 'email_unlocked']: true,
        credits_remaining: r.credits_remaining,
      }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setUnlocking('');
    }
  }

  async function loadAudio(conversationId) {
    setAudioLoading(true);
    try {
      const url = `${API_BASE}/candidates/${encodeURIComponent(candidateId)}/audio/${encodeURIComponent(conversationId)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
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

  if (err && !data) return <div className="error-banner">{err}</div>;
  if (!data) return <div className="d-skeleton">Loading candidate…</div>;

  const initials = (data.name || '?').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
  const nav = data.navigation || {};
  const p = data.profile || {};
  const pi = p.personal_info || {};
  const cur = p.current_role || {};
  const comp = p.compensation || {};

  return (
    <div className="dashboard-page candidate-page">
      <div className="cand-topbar">
        <Link to={`/dashboard/roles/${code}`} className="d-back">← Back to candidates</Link>
        <div className="cand-nav">
          {nav.position && nav.total && (
            <span className="cand-pos">Candidate {nav.position} of {nav.total}</span>
          )}
          <button
            disabled={!nav.prev_id}
            className="cand-nav-btn"
            onClick={() => navigate(`/dashboard/roles/${code}/candidates/${nav.prev_id}`)}
          >← Prev</button>
          <button
            disabled={!nav.next_id}
            className="cand-nav-btn primary"
            onClick={() => navigate(`/dashboard/roles/${code}/candidates/${nav.next_id}`)}
          >Next →</button>
        </div>
      </div>

      {/* Hero with name + contact reveal at TOP */}
      <div className="cand-hero anim-fade-up">
        <div className="cand-hero-left">
          <div className="cand-avatar-lg">{initials}</div>
          <div>
            <h1>{data.name || 'Candidate'}</h1>
            {cur.title && (
              <p className="cand-role-line">
                <strong>{cur.title}</strong>{cur.company ? ` · ${cur.company}` : ''}
              </p>
            )}
            <p className="cand-hero-tag">
              <span className="dot-status" /> Pre-screened by BobmanConnect AI · Verified by humans
            </p>
            <div className="cand-quick-meta">
              {pi.current_location && <span>📍 {pi.current_location}</span>}
              {pi.open_to_relocation && <span>✈️ Relocation: {pi.open_to_relocation}</span>}
              {comp.notice_period && <span>📆 Notice: {comp.notice_period}</span>}
            </div>
            <div className="cand-quick-actions">
              {data.cv_file_url && (
                <a href={data.cv_file_url} target="_blank" rel="noopener noreferrer" className="btn-pill btn-pill-ghost btn-pill-sm">
                  📄 Download CV
                </a>
              )}
              {data.linkedin_url && (
                <a href={data.linkedin_url} target="_blank" rel="noopener noreferrer" className="btn-pill btn-pill-ghost btn-pill-sm">
                  in LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="cand-contact-card">
          <div className="cand-contact-head">
            <h3>Contact information</h3>
            <span className="cand-credits-badge">{data.credits_remaining} credits left</span>
          </div>
          <div className="cand-contact-row">
            <div className="cand-contact-label">
              <span className="cand-contact-icon">📱</span>
              <span>Phone</span>
            </div>
            {data.phone_unlocked ? (
              <a href={`tel:${data.phone_number}`} className="cand-contact-value">{data.phone_number}</a>
            ) : (
              <button
                className="btn-pill btn-pill-primary btn-pill-sm"
                onClick={() => handleUnlock('phone')}
                disabled={unlocking === 'phone' || data.credits_remaining <= 0}
              >
                {unlocking === 'phone' ? 'Revealing…' : 'Reveal · 1 credit'}
              </button>
            )}
          </div>
          <div className="cand-contact-row">
            <div className="cand-contact-label">
              <span className="cand-contact-icon">✉️</span>
              <span>Email</span>
            </div>
            {data.email_unlocked ? (
              <a href={`mailto:${data.email}`} className="cand-contact-value">{data.email}</a>
            ) : (
              <button
                className="btn-pill btn-pill-primary btn-pill-sm"
                onClick={() => handleUnlock('email')}
                disabled={unlocking === 'email' || data.credits_remaining <= 0}
              >
                {unlocking === 'email' ? 'Revealing…' : 'Reveal · 1 credit'}
              </button>
            )}
          </div>
          {data.credits_remaining <= 0 && (
            <p className="cand-no-credits">
              Out of credits — <a href="mailto:hello@bobmanconnect.com">contact us</a> to add more.
            </p>
          )}
        </div>
      </div>

      {err && <div className="error-banner">{err}</div>}

      {/* AI Pitch — front and center */}
      <div className="cand-pitch anim-fade-up" style={{ animationDelay: '0.05s' }}>
        <div className="cand-pitch-head">
          <span className="cand-ai-badge">
            <span className="ai-pulse" />
            AI fit summary
          </span>
          <h2>Why this candidate is a strong fit</h2>
        </div>
        <p className="cand-pitch-body">{data.pitch}</p>
      </div>

      {/* Detailed AI Summary — from cumulative call insights */}
      {data.ai_summary && (
        <div className="ai-summary anim-fade-up" style={{ animationDelay: '0.08s' }}>
          <div className="ai-summary-head">
            <div>
              <span className="ai-summary-eyebrow">
                <span className="ai-pulse" />
                AI candidate insights
              </span>
              <h2>What our AI agent learned about this candidate</h2>
            </div>
            <div className="ai-snapshot">
              {data.ai_summary.experience_years != null && (
                <div className="ai-stat">
                  <span className="ai-stat-num">{data.ai_summary.experience_years}+</span>
                  <span className="ai-stat-label">years experience</span>
                </div>
              )}
              {data.ai_summary.call_count != null && (
                <div className="ai-stat">
                  <span className="ai-stat-num">{data.ai_summary.call_count}</span>
                  <span className="ai-stat-label">screening call{data.ai_summary.call_count !== 1 ? 's' : ''}</span>
                </div>
              )}
              {data.ai_summary.qualification?.score != null && (
                <div className="ai-stat ai-stat-score">
                  <span className="ai-stat-num">{data.ai_summary.qualification.score}<span style={{ fontSize: 16, opacity: 0.6 }}>/10</span></span>
                  <span className="ai-stat-label">AI fit score</span>
                </div>
              )}
            </div>
          </div>

          {/* Inline call player — compact, integrated with AI summary */}
          {data.best_call?.elevenlabs_conversation_id && (
            <div className="ai-call-strip">
              {!audioBlobUrl ? (
                <button
                  className="ai-call-btn"
                  onClick={() => loadAudio(data.best_call.elevenlabs_conversation_id)}
                  disabled={audioLoading}
                >
                  <span className="ai-call-play">▶</span>
                  <div className="ai-call-meta">
                    <span className="ai-call-title">
                      {audioLoading ? 'Loading recording…' : 'Listen to the screening call'}
                    </span>
                    <span className="ai-call-sub">
                      {Math.floor((data.best_call.duration_secs || 0) / 60)} min · narrated by our AI agent
                    </span>
                  </div>
                  <span className="ai-call-wave">
                    <span /><span /><span /><span /><span /><span /><span /><span />
                  </span>
                </button>
              ) : (
                <audio
                  controls
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                  src={audioBlobUrl}
                  className="ai-call-audio"
                  autoPlay
                />
              )}
            </div>
          )}

          {/* Engagement chips */}
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

          {/* Two-column insights */}
          {(data.ai_summary.key_information?.length > 0 || data.ai_summary.strengths?.length > 0) && (
            <div className="ai-cols">
              {data.ai_summary.key_information?.length > 0 && (
                <div className="ai-col">
                  <h4><span className="ai-col-icon">🔍</span> What we learned</h4>
                  <ul className="ai-list">
                    {data.ai_summary.key_information.map((s, i) => (
                      <li key={i} style={{ animationDelay: `${0.05 * i}s` }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {data.ai_summary.strengths?.length > 0 && (
                <div className="ai-col">
                  <h4><span className="ai-col-icon">💪</span> Standout strengths</h4>
                  <ul className="ai-list ai-list-strong">
                    {data.ai_summary.strengths.map((s, i) => (
                      <li key={i} style={{ animationDelay: `${0.05 * i}s` }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Key quotes */}
          {data.ai_summary.key_quotes?.length > 0 && (
            <div className="ai-quotes">
              <h4>In their own words</h4>
              <div className="ai-quote-grid">
                {data.ai_summary.key_quotes.map((q, i) => (
                  <blockquote key={i} className="ai-quote">"{q}"</blockquote>
                ))}
              </div>
            </div>
          )}

          {/* Qualification verdict */}
          {data.ai_summary.qualification && (
            <div className="ai-verdict">
              <div className="ai-verdict-head">
                <span className="ai-verdict-icon">🎯</span>
                <div>
                  <div className="ai-verdict-label">AI recommendation</div>
                  <div className="ai-verdict-value">{data.ai_summary.qualification.recommendation}</div>
                </div>
              </div>
              {data.ai_summary.qualification.reasoning?.length > 0 && (
                <ul className="ai-verdict-reasons">
                  {data.ai_summary.qualification.reasoning.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick stats row */}
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
        {data.successful_calls != null && (
          <div className="stat-tile">
            <span className="stat-tile-icon">📞</span>
            <div>
              <div className="stat-tile-label">Screening calls</div>
              <div className="stat-tile-value">{data.successful_calls}</div>
            </div>
          </div>
        )}
      </div>

      {/* Professional summary */}
      {p.professional_summary && (
        <div className="cand-pane anim-fade-up" style={{ animationDelay: '0.15s' }}>
          <h3>Professional summary</h3>
          <p className="cand-prose">{p.professional_summary}</p>
        </div>
      )}

      {/* Strengths only (no concerns) */}
      {data.match?.key_strengths?.length > 0 && (
        <div className="cand-pane pane-green anim-fade-up" style={{ animationDelay: '0.18s' }}>
          <h3>Key strengths</h3>
          <ul className="cand-list">
            {data.match.key_strengths.map((s, i) => (
              <li key={i}><span className="bullet">✓</span><span>{s}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* Highlights from cumulative summary */}
      {p.highlights?.length > 0 && (
        <div className="cand-pane anim-fade-up" style={{ animationDelay: '0.2s' }}>
          <h3>What we learned</h3>
          <ul className="cand-list">
            {p.highlights.map((s, i) => (
              <li key={i}><span className="bullet bullet-blue">★</span><span>{s}</span></li>
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
                      {w.responsibilities.map((r, j) => <li key={j}>{r}</li>)}
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

      {/* Achievements */}
      {p.achievements?.length > 0 && (
        <div className="cand-pane anim-fade-up" style={{ animationDelay: '0.3s' }}>
          <h3>Notable achievements</h3>
          <ul className="cand-list">
            {p.achievements.map((s, i) => {
              const text = typeof s === 'string' ? s : (s?.title || s?.description || JSON.stringify(s));
              return <li key={i}><span className="bullet bullet-amber">🏆</span><span>{text}</span></li>;
            })}
          </ul>
        </div>
      )}

      {/* Bottom Next button */}
      {nav.next_id && (
        <div className="cand-foot">
          <button
            className="btn-pill btn-pill-primary btn-pill-lg"
            onClick={() => navigate(`/dashboard/roles/${code}/candidates/${nav.next_id}`)}
          >
            See next candidate <span className="arrow">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
