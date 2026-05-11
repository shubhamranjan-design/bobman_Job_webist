import { Link } from 'react-router-dom';

export default function ServicesPage() {
  return (
    <>
      <section className="section section-hero-sm">
        <div className="section-head">
          <span className="eyebrow">Services</span>
          <h1>Recruitment, but scaled by AI.</h1>
          <p className="section-sub">
            We blend a proprietary AI voice agent with a senior human recruiter team to deliver role-fit
            shortlists for the most demanding US robotics and humanoid teams.
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="section-alt-inner">
        <div className="services-stack">
          <article className="service-row">
            <div className="service-media s-grad-1" />
            <div>
              <span className="eyebrow">01 · Sourcing &amp; screening</span>
              <h2>Curated robotics talent at scale.</h2>
              <p>
                Most candidates we onboard come through proactive sourcing across multiple channels.
                Each one passes through our AI voice agent for a structured 10-15 minute interview
                covering role fit, recent projects, motivation and notice period.
              </p>
              <ul className="checks">
                <li>Multi-channel sourcing (Naukri, LinkedIn, Referrals)</li>
                <li>AI voice interview with full transcript</li>
                <li>Human-validated red flag detection</li>
              </ul>
            </div>
          </article>

          <article className="service-row reverse">
            <div className="service-media s-grad-2" />
            <div>
              <span className="eyebrow">02 · Role matching</span>
              <h2>Profile-to-role fit, not keyword matching.</h2>
              <p>
                Our matching engine scores every candidate across skills, depth of experience,
                industry overlap, work-environment compatibility and career motivation. We surface only
                top-tier matches per role.
              </p>
              <ul className="checks">
                <li>Multi-dimensional fit score</li>
                <li>Strengths &amp; concerns highlighted per match</li>
                <li>Re-ranking when new roles open</li>
              </ul>
            </div>
          </article>

          <article className="service-row">
            <div className="service-media s-grad-3" />
            <div>
              <span className="eyebrow">03 · Decision support</span>
              <h2>One page. Full picture.</h2>
              <p>
                Each candidate page gives your hiring manager an AI-written fit summary in plain English,
                key strengths, considerations, and a click-to-play recording of the screening call.
                Reveal contact info on demand &mdash; pay only when you choose to engage.
              </p>
              <ul className="checks">
                <li>Plain-English AI fit summary</li>
                <li>Listenable call recording with summary</li>
                <li>1 credit unlocks phone or email</li>
              </ul>
            </div>
          </article>
        </div>
        </div>
      </section>

      <section className="cta-strip">
        <div className="cta-card">
          <div>
            <h2>See it in action.</h2>
            <p>Open the dashboard and browse pre-screened robotics candidates for your roles.</p>
          </div>
          <div className="cta-actions">
            <Link to="/login" className="btn-pill btn-pill-primary btn-pill-lg">
              Open dashboard <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
