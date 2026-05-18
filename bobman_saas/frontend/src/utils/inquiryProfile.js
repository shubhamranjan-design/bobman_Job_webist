// Caches the inquiry-form profile (company, email, contact, budget) in localStorage
// so repeat shortlists don't require retyping everything.

const KEY = 'bc.inquiry_profile';

export function getInquiryProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function setInquiryProfile(profile) {
  // Persist fields likely to repeat across submissions. Skip notes + candidates.
  const {
    company_name = '', email = '', contact = '', budget = '', role_text = '',
  } = profile || {};
  localStorage.setItem(KEY, JSON.stringify({ company_name, email, contact, budget, role_text }));
}

export function clearInquiryProfile() {
  localStorage.removeItem(KEY);
}
