// localStorage-backed shortlist of masked candidate IDs

const KEY = 'bc.shortlist';
const EVT = 'bc:shortlist:change';

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
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVT, { detail: list }));
}

export function getShortlist() {
  return read();
}

export function isShortlisted(maskedId) {
  return read().includes(maskedId);
}

export function addToShortlist(maskedId) {
  const cur = read();
  if (!cur.includes(maskedId)) {
    write([...cur, maskedId]);
  }
}

export function removeFromShortlist(maskedId) {
  write(read().filter((x) => x !== maskedId));
}

export function toggleShortlist(maskedId) {
  if (isShortlisted(maskedId)) removeFromShortlist(maskedId);
  else addToShortlist(maskedId);
  return isShortlisted(maskedId);
}

export function clearShortlist() {
  write([]);
}

export function onShortlistChange(handler) {
  const wrapped = () => handler(read());
  window.addEventListener(EVT, wrapped);
  // Cross-tab sync
  const storage = (e) => { if (e.key === KEY) handler(read()); };
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVT, wrapped);
    window.removeEventListener('storage', storage);
  };
}
