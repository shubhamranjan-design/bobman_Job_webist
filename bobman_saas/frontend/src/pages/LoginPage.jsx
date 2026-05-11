import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { login, isAuthed } from '../utils/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthed()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { token, company } = await api.login(email.trim().toLowerCase(), password);
      login(token, company);
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setErr(e.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-split">
      <aside className="auth-aside">
        <Link to="/" className="m-brand">
          <span className="m-brand-logo">
            <span className="m-brand-dot" />
            <span className="m-brand-dot m-brand-dot-2" />
          </span>
          <span className="m-brand-name">BobmanConnect</span>
        </Link>
        <div className="auth-aside-content">
          <h1>Talk to robotics talent, today.</h1>
          <p>
            Browse curated, AI-screened candidate profiles for your humanoid &amp; embodied AI roles.
            Listen to actual screening calls. Reveal contact details on demand.
          </p>
          <div className="auth-quote">
            <p>“Cut our shortlist time from 2 weeks to under 48 hours.”</p>
            <span>— Hiring lead, Bay Area robotics startup</span>
          </div>
        </div>
        <p className="auth-aside-foot">
          Don't have an account? <a href="mailto:hello@bobmanconnect.com">Request access</a>.
        </p>
      </aside>

      <section className="auth-main">
        <div className="auth-card">
          <h2>Sign in</h2>
          <p className="muted">Use the credentials shared with your team to access the dashboard.</p>
          <form onSubmit={submit} className="auth-form">
            <label>
              Work email
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourcompany.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            {err && <div className="error-banner">{err}</div>}
            <button type="submit" disabled={busy} className="btn-pill btn-pill-primary btn-pill-lg btn-block">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="auth-back">
            <Link to="/">← Back to home</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
