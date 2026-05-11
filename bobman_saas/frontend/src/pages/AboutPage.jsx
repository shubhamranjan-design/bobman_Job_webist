import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <>
      <section className="section section-hero-sm">
        <div className="section-head">
          <span className="eyebrow">About</span>
          <h1>Recruiting reimagined for embodied AI.</h1>
          <p className="section-sub">
            BobmanConnect was built because robotics teams shouldn't have to wade through hundreds of résumés.
            We use a voice-AI screening agent to talk to candidates the way a senior recruiter would &mdash;
            then let humans validate the calls that matter.
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="section-alt-inner">
        <div className="about-grid">
          <div className="about-card">
            <h3>Our mission</h3>
            <p>
              Bring qualified, motivated robotics talent to the US humanoid and embodied AI companies
              building the next decade of physical intelligence.
            </p>
          </div>
          <div className="about-card">
            <h3>Why a voice agent?</h3>
            <p>
              Résumés don't tell you about depth. A 10-minute structured conversation does.
              Our agent runs that conversation thousands of times a day, consistently and at scale.
            </p>
          </div>
          <div className="about-card">
            <h3>Why humans matter</h3>
            <p>
              AI is great at scale, but a senior recruiter is great at edge cases. Every flagged call
              is reviewed by a human before a candidate appears in your shortlist.
            </p>
          </div>
          <div className="about-card">
            <h3>Where we are</h3>
            <p>
              Operating teams in San Francisco and Bengaluru. Our AI agent makes ~5,000 candidate
              calls per month and the network is growing fast.
            </p>
          </div>
        </div>
        </div>
      </section>

      <section className="section section-dark">
        <div className="section-head">
          <span className="eyebrow eyebrow-light">Behind the product</span>
          <h2>Built by people who hire engineers, for people who hire engineers.</h2>
          <p className="section-sub">
            We obsess over signal-to-noise. Every feature is shipped with one question: does this help
            the hiring manager say yes or no faster?
          </p>
        </div>
      </section>

      <section className="cta-strip">
        <div className="cta-card">
          <div>
            <h2>Hire without the noise.</h2>
            <p>Open your dashboard or talk to us about a custom requirement.</p>
          </div>
          <div className="cta-actions">
            <Link to="/login" className="btn-pill btn-pill-primary btn-pill-lg">
              Open dashboard <span className="arrow">→</span>
            </Link>
            <a href="mailto:hello@bobmanconnect.com" className="btn-pill btn-pill-ghost btn-pill-lg">Email us</a>
          </div>
        </div>
      </section>
    </>
  );
}
