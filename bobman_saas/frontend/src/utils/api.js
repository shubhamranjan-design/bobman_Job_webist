// Resolve API base URL: production = same origin under /home/api, dev = vite proxy /api
const API_BASE = (() => {
  if (import.meta.env.DEV) return '/api';
  return '/home/api';
})();

function getToken() {
  return localStorage.getItem('saas_token');
}

function setToken(t) {
  if (t) localStorage.setItem('saas_token', t);
  else localStorage.removeItem('saas_token');
}

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) {
    setToken(null);
    if (!path.startsWith('/login')) {
      window.location.href = '/home/login';
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  login: (email, password) =>
    request('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/me'),
  listRoles: () => request('/roles'),
  searchRoles: (q) => request(`/roles/search?q=${encodeURIComponent(q)}`),
  getRole: (code) => request(`/roles/${encodeURIComponent(code)}`),
  listCandidates: (code, limit = 20) =>
    request(`/roles/${encodeURIComponent(code)}/candidates?limit=${limit}`),
  getCandidate: (id, role) =>
    request(`/candidates/${encodeURIComponent(id)}?role=${encodeURIComponent(role)}`),
  unlock: (id, field) =>
    request(`/candidates/${encodeURIComponent(id)}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ field }),
    }),
  audioUrl: (candidateId, conversationId) => {
    const t = getToken();
    return `${API_BASE}/candidates/${encodeURIComponent(candidateId)}/audio/${encodeURIComponent(conversationId)}`;
  },
};

export { getToken, setToken, API_BASE };
