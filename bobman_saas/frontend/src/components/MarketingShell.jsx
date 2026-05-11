import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { isAuthed } from '../utils/auth';
import ThemeToggle from './ThemeToggle';
import AnimatedMesh from './AnimatedMesh';

export default function MarketingShell({ children }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

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
            <span className="m-brand-name">BobmanConnect</span>
          </Link>

          <div className={`m-nav-links ${mobileOpen ? 'open' : ''}`}>
            <NavLink to="/" end className="m-nav-link">Home</NavLink>
            <NavLink to="/services" className="m-nav-link">Services</NavLink>
            <NavLink to="/about" className="m-nav-link">About</NavLink>
            <a href="#contact" className="m-nav-link">Contact</a>
          </div>

          <div className="m-nav-actions">
            <ThemeToggle size="sm" />
            {isAuthed() ? (
              <Link to="/dashboard" className="btn-pill btn-pill-primary">
                Open dashboard <span className="arrow">→</span>
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-pill btn-pill-ghost">Sign in</Link>
                <Link to="/login" className="btn-pill btn-pill-primary">
                  Hire talent <span className="arrow">→</span>
                </Link>
              </>
            )}
            <button className="m-nav-burger" onClick={() => setMobileOpen(!mobileOpen)}>
              <span /><span /><span />
            </button>
          </div>
        </div>
      </nav>

      <main className="m-main">{children}</main>

      <footer className="m-footer" id="contact">
        <div className="m-footer-inner">
          <div className="m-footer-brand">
            <div className="m-brand">
              <span className="m-brand-logo">
                <span className="m-brand-dot" />
                <span className="m-brand-dot m-brand-dot-2" />
              </span>
              <span className="m-brand-name">BobmanConnect</span>
            </div>
            <p className="m-footer-tagline">
              Pre-screened, AI-vetted robotics talent for US humanoid &amp; AI companies.
            </p>
          </div>
          <div className="m-footer-cols">
            <div>
              <h5>Product</h5>
              <Link to="/services">Services</Link>
              <Link to="/login">Sign in</Link>
              <Link to="/login">Hire talent</Link>
            </div>
            <div>
              <h5>Company</h5>
              <Link to="/about">About</Link>
              <a href="mailto:hello@bobmanconnect.com">Contact</a>
            </div>
            <div>
              <h5>Get in touch</h5>
              <a href="mailto:hello@bobmanconnect.com">hello@bobmanconnect.com</a>
              <span className="m-footer-muted">San Francisco · Bengaluru</span>
            </div>
          </div>
        </div>
        <div className="m-footer-bottom">
          <span>© {new Date().getFullYear()} BobmanConnect. All rights reserved.</span>
          <span>Built with humans in the loop.</span>
        </div>
      </footer>
    </div>
  );
}
