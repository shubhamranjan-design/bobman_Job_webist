// Public, no-auth API client.
// On bobman.ai we serve at the root, so /api/* works directly.
// On the legacy api.bobmanconnect.com/home/ deployment, nginx rewrites /home/api/* → backend.
// We pick the right base by inspecting the page URL at runtime.
const API_BASE = (() => {
  if (import.meta.env.DEV) return '/api';
  const path = (typeof window !== 'undefined' ? window.location.pathname : '/') || '/';
  return path.startsWith('/home/') || path === '/home' ? '/home/api' : '/api';
})();

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

function buildQuery(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  getCatalog: (filters = {}) => request(`/catalog${buildQuery(filters)}`),
  getCandidate: (maskedId) => request(`/candidate/${encodeURIComponent(maskedId)}`),
  getRoles: () => request('/roles_public'),
  submitInquiry: (body) =>
    request('/inquiries', { method: 'POST', body: JSON.stringify(body) }),
  audioUrl: (maskedId, conversationId) =>
    `${API_BASE}/candidate/${encodeURIComponent(maskedId)}/audio/${encodeURIComponent(conversationId)}`,
};

export { API_BASE };
