import { useState } from 'react';

const USERS = {
  'admin@awign.com': { password: '0000', role: 'admin' },
  'expert@awign.com': { password: '0000', role: 'recruiter' },
  'awign_core@awign.com': { password: '0000', role: 'admin', lockedFilters: { data_team_tag: ['awign_core'] } },
};

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      const user = USERS[email.toLowerCase().trim()];
      if (!user || user.password !== password) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      const authData = { email: email.toLowerCase().trim(), role: user.role };
      if (user.lockedFilters) authData.lockedFilters = user.lockedFilters;
      sessionStorage.setItem('dashboard_auth', JSON.stringify(authData));
      onLogin(authData);
      setLoading(false);
    }, 300);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Recruiter Dashboard</h1>
          <p>Sign in to continue</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              autoFocus
            />
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
