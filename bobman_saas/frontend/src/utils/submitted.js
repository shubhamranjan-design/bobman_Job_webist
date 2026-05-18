// Per-device record of candidates that have already been submitted in an inquiry.
// Distinct from the shortlist — the shortlist is what's currently selected;
// submitted is a permanent local mark so the user can see what they've already requested.

const KEY = 'bc.submitted_ids';
const EVT = 'bc:submitted:change';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(list) {
  // dedupe + cap to last 500 to avoid runaway growth
  const uniq = Array.from(new Set(list)).slice(-500);
  localStorage.setItem(KEY, JSON.stringify(uniq));
  window.dispatchEvent(new CustomEvent(EVT, { detail: uniq }));
}

export function getSubmitted() {
  return read();
}

export function isSubmitted(maskedId) {
  return read().includes(maskedId);
}

export function addSubmitted(maskedIds) {
  const cur = read();
  write([...cur, ...(Array.isArray(maskedIds) ? maskedIds : [maskedIds])]);
}

export function onSubmittedChange(handler) {
  const wrapped = () => handler(read());
  window.addEventListener(EVT, wrapped);
  const storage = (e) => { if (e.key === KEY) handler(read()); };
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVT, wrapped);
    window.removeEventListener('storage', storage);
  };
}
