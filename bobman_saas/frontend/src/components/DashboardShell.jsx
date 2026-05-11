import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { logout, getCompany } from '../utils/auth';
import ThemeToggle from './ThemeToggle';

export default function DashboardShell({ children }) {
  const [company, setCompany] = useState(getCompany());
  const navigate = useNavigate();

  useEffect(() => {
    api.me().then(setCompany).catch(() => {});
  }, []);

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  const initials = (company?.name || 'BC').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="d-shell">
      <header className="d-header">
        <div className="d-header-inner">
          <Link to="/dashboard" className="m-brand">
            <span className="m-brand-logo">
              <span className="m-brand-dot" />
              <span className="m-brand-dot m-brand-dot-2" />
            </span>
            <span className="m-brand-name">BobmanConnect</span>
          </Link>
          <div className="d-header-right">
            {company && (
              <div className="d-credits" title="Credits remaining">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg>
                <span><strong>{company.credits_remaining}</strong> credits</span>
              </div>
            )}
            <ThemeToggle size="sm" />
            <div className="d-avatar">{initials}</div>
            <button className="btn-pill btn-pill-ghost btn-pill-sm" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="d-main">{children}</main>
    </div>
  );
}
