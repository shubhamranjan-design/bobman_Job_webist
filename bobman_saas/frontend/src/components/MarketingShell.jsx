import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import AnimatedMesh from './AnimatedMesh';
import { getShortlist, onShortlistChange } from '../utils/shortlist';

export default function MarketingShell({ children }) {
  const [scrolled, setScrolled] = useState(false);
  const [shortlistCount, setShortlistCount] = useState(getShortlist().length);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const off = onShortlistChange((list) => setShortlistCount(list.length));
    return off;
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  function openShortlist() {
    window.dispatchEvent(new CustomEvent('bc:open-shortlist'));
  }

  return (
    <div className="m-shell">
      <AnimatedMesh />
      <nav className={`m-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="m-nav-inner">
          <Link to="/" className="m-brand">
            <span className="m-brand-logo">
              <span className="m-brand-dot" />
              <span className="m-brand-dot m-brand-dot-2" />
            </span>
            <span className="m-brand-name">Bobman</span>
          </Link>

          <div className="m-nav-actions">
            <ThemeToggle size="sm" />
            <button
              className={`shortlist-pill ${shortlistCount > 0 ? 'active' : ''}`}
              onClick={openShortlist}
              aria-label={`Shortlist (${shortlistCount})`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Shortlist
              <span className="shortlist-count">{shortlistCount}</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="m-main">{children}</main>

      <footer className="m-footer" id="contact">
        <div className="m-footer-cta">
          <div>
            <h3>Ready to hire?</h3>
            <p>Shortlist any candidate above — we'll coordinate interviews within 24 hours.</p>
          </div>
          <a href="mailto:sales@bobman.ai" className="btn-pill btn-pill-primary btn-pill-lg">
            Talk to us <span className="arrow">→</span>
          </a>
        </div>
        <div className="m-footer-inner">
          <div className="m-footer-brand">
            <div className="m-brand">
              <span className="m-brand-logo">
                <span className="m-brand-dot" />
                <span className="m-brand-dot m-brand-dot-2" />
              </span>
              <span className="m-brand-name">Bobman</span>
            </div>
            <p className="m-footer-tagline">
              Pre-screened, AI-vetted robotics talent. Hire fast, pay only on success.
            </p>
          </div>
          <div className="m-footer-cols">
            <div>
              <h5>How it works</h5>
              <span className="m-footer-muted">1 · Shortlist candidates</span>
              <span className="m-footer-muted">2 · Schedule interviews</span>
              <span className="m-footer-muted">3 · Pay $10k after you hire</span>
            </div>
            <div>
              <h5>For companies</h5>
              <a href="mailto:sales@bobman.ai">Request access</a>
              <a href="mailto:sales@bobman.ai">Custom role inquiry</a>
              <a href="mailto:sales@bobman.ai">Volume pricing</a>
            </div>
            <div>
              <h5>Get in touch</h5>
              <a href="mailto:sales@bobman.ai">sales@bobman.ai</a>
              <span className="m-footer-muted">San Francisco · Bengaluru</span>
            </div>
          </div>
        </div>
        <div className="m-footer-bottom">
          <span>© {new Date().getFullYear()} Bobman. All rights reserved.</span>
          <span>Anonymized profiles · No upfront fees · Pay on hire</span>
        </div>
      </footer>
    </div>
  );
}
