import { setToken, getToken } from './api';

export function login(token, company) {
  setToken(token);
  localStorage.setItem('saas_company', JSON.stringify(company));
}

export function logout() {
  setToken(null);
  localStorage.removeItem('saas_company');
}

export function getCompany() {
  try {
    const raw = localStorage.getItem('saas_company');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthed() {
  return !!getToken();
}

export function updateCompanyCredits(credits) {
  const c = getCompany();
  if (c) {
    c.credits_remaining = credits;
    localStorage.setItem('saas_company', JSON.stringify(c));
  }
}
