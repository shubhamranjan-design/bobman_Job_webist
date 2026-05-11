import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-blob hero-blob-1" />
          <div className="hero-blob hero-blob-2" />
        </div>
        <div className="hero-content">
          <span className="eyebrow">For US robotics &amp; humanoid companies</span>
          <h1>
            Hire pre-screened robotics talent <span className="grad">faster than ever</span>
          </h1>
          <p className="hero-sub">
            Every candidate is interviewed by our AI agent and verified by humans. No résumés to sift.
            No long phone screens. Just curated profiles, ready to interview.
          </p>
          <div className="hero-cta-row">
            <Link to="/login" className="btn-pill btn-pill-primary btn-pill-lg">
              Browse talent <span className="arrow">→</span>
            </Link>
            <a href="#how" className="btn-pill btn-pill-ghost btn-pill-lg">How it works</a>
          </div>
          <div className="hero-trust">
            <div><strong>1,200+</strong><span>screened candidates</span></div>
            <div><strong>10</strong><span>active US roles</span></div>
            <div><strong>72 hrs</strong><span>avg time to shortlist</span></div>
          </div>
        </div>
      </section>

      {/* Logos / trust */}
      <section className="logos">
        <p className="logos-label">TRUSTED FOR ROLES IN</p>
        <div className="logos-row">
          <span>Robotics Engineering</span>
          <span className="dot" />
          <span>Computer Vision</span>
          <span className="dot" />
          <span>SLAM &amp; Perception</span>
          <span className="dot" />
          <span>AI Data Infra</span>
          <span className="dot" />
          <span>Embodied AI</span>
        </div>
      </section>

      {/* Services preview — alt background */}
      <section className="section section-alt">
        <div className="section-alt-inner">
        <div className="section-head">
          <span className="eyebrow">What you get</span>
          <h2>An end-to-end recruiting layer, not a job board.</h2>
          <p className="section-sub">
            We replace 80% of the recruiter's job with our AI agent &mdash; you spend time only on candidates worth meeting.
          </p>
        </div>
        <div className="feat-grid">
          <div className="feat-card">
            <div className="feat-icon" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>🎯</div>
            <h3>Role-matched profiles</h3>
            <p>Every candidate is mapped to the role using AI scoring across skills, experience, motivation and concerns.</p>
          </div>
          <div className="feat-card">
            <div className="feat-icon" style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)' }}>🎙️</div>
            <h3>Voice-screened</h3>
            <p>Our AI conducts a full interview by voice. You get the recording, transcript summary, and outcome &mdash; all on the candidate page.</p>
          </div>
          <div className="feat-card">
            <div className="feat-icon" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>🧠</div>
            <h3>AI fit summary</h3>
            <p>Why this candidate is a strong fit, written in plain language. No jargon, no buzzwords.</p>
          </div>
          <div className="feat-card">
            <div className="feat-icon" style={{ background: 'linear-gradient(135deg,#0ea5e9,#3b82f6)' }}>🔐</div>
            <h3>Pay only when you reach out</h3>
            <p>Browsing is free. You spend a credit only when you reveal a candidate's phone or email.</p>
          </div>
        </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section section-dark" id="how">
        <div className="section-head">
          <span className="eyebrow eyebrow-light">How it works</span>
          <h2>Humans in the loop. AI in the trenches.</h2>
          <p className="section-sub">
            We combine AI scale with human judgement &mdash; so the bar stays high without slowing you down.
          </p>
        </div>
        <div className="how-steps">
          <div className="how-step">
            <span className="how-num">01</span>
            <h3>Sourcing</h3>
            <p>We surface candidates from multiple channels &mdash; Naukri, referrals, LinkedIn &mdash; into a single matching pipeline.</p>
          </div>
          <div className="how-step">
            <span className="how-num">02</span>
            <h3>AI voice screening</h3>
            <p>Our voice agent runs a structured interview to assess role fit, experience depth, motivation and red flags.</p>
          </div>
          <div className="how-step">
            <span className="how-num">03</span>
            <h3>Human review</h3>
            <p>A senior recruiter reviews flagged calls, validates strengths and adds context where the AI is uncertain.</p>
          </div>
          <div className="how-step">
            <span className="how-num">04</span>
            <h3>You decide</h3>
            <p>You see only the best-fit candidates per role &mdash; with audio, summary and unlock-on-demand contact details.</p>
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="cta-strip">
        <div className="cta-card">
          <div>
            <h2>Ready to see your shortlist?</h2>
            <p>Sign in to browse candidates pre-screened for your robotics role. 10 free contact reveals on the house.</p>
          </div>
          <div className="cta-actions">
            <Link to="/login" className="btn-pill btn-pill-primary btn-pill-lg">
              Get started <span className="arrow">→</span>
            </Link>
            <a href="mailto:hello@bobmanconnect.com" className="btn-pill btn-pill-ghost btn-pill-lg">Talk to us</a>
          </div>
        </div>
      </section>
    </>
  );
}
