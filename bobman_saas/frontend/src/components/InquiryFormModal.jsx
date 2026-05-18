import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/api';
import { addSubmitted } from '../utils/submitted';
import { getInquiryProfile, setInquiryProfile } from '../utils/inquiryProfile';

const ROLE_SUGGESTIONS = [
  'Any / multiple roles',
  'Senior Robotics Engineer',
  'Data Science / Data Engineering',
  'Computer Vision / ML Engineering',
  'Robotics / Software Engineering',
  'Machine Learning / MLOps',
  'Software Engineering / AI Infrastructure',
  'Robotics SE — Perception',
  'Senior SE — Perception II',
  'AI / Data Infrastructure · Robotics',
  'Machine Learning Engineering (SLAM)',
];

export default function InquiryFormModal({ maskedIds, onClose, onSubmitted }) {
  const profile = getInquiryProfile();
  const [form, setForm] = useState({
    company_name: profile.company_name || '',
    email: profile.email || '',
    contact: profile.contact || '',
    budget: profile.budget || '',
    role_text: profile.role_text || '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState(null);
  const modalRef = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!form.company_name.trim() || !form.email.trim() || !form.contact.trim()) {
      setErr('Company, work email, and contact are required.');
      return;
    }
    if (!maskedIds || maskedIds.length === 0) {
      setErr('No candidates in shortlist.');
      return;
    }
    setBusy(true);
    try {
      const body = {
        company_name: form.company_name.trim(),
        email: form.email.trim(),
        contact: form.contact.trim(),
        budget: form.budget.trim() || null,
        role_code: form.role_text.trim() || null,  // free-text role; backend stores as-is
        notes: form.notes.trim() || null,
        candidate_ids: maskedIds,
      };
      const res = await api.submitInquiry(body);
      // Cache form profile + mark these candidates as submitted on this device
      setInquiryProfile(form);
      addSubmitted(maskedIds);
      setSuccess(res);
      // NOTE: we intentionally do NOT clear the shortlist — the user may want
      // to keep iterating with the same set, or submit another inquiry.
    } catch (e) {
      setErr(e.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        {success ? (
          <div className="modal-success">
            <div className="success-icon">✓</div>
            <h2>Thanks!</h2>
            <p className="muted">
              {success.message || 'Our team will reach out within 24 hours.'}
            </p>
            <p className="muted small">Reference #{success.id}</p>
            <button className="btn-pill btn-pill-primary btn-pill-lg" onClick={onSubmitted}>Done</button>
          </div>
        ) : (
          <>
            <div className="modal-head">
              <h2>We Schedule Interviews</h2>
              <p className="muted">
                Shortlist: <strong>{maskedIds.length}</strong> candidate{maskedIds.length !== 1 ? 's' : ''} · Our team replies within 24 hours.
              </p>
            </div>
            <form onSubmit={submit} className="inquiry-form">
              <label>
                Company name *
                <input
                  type="text"
                  required
                  value={form.company_name}
                  onChange={(e) => update('company_name', e.target.value)}
                  placeholder="Acme Robotics"
                />
              </label>
              <div className="form-row">
                <label>
                  Work email *
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                    placeholder="you@yourcompany.com"
                  />
                </label>
                <label>
                  Contact number *
                  <input
                    type="tel"
                    required
                    value={form.contact}
                    onChange={(e) => update('contact', e.target.value)}
                    placeholder="+1 555 123 4567"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Role of interest
                  <input
                    type="text"
                    list="role-suggestions"
                    value={form.role_text}
                    onChange={(e) => update('role_text', e.target.value)}
                    placeholder="e.g. Senior Robotics Engineer (type or pick)"
                    autoComplete="off"
                  />
                  <datalist id="role-suggestions">
                    {ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
                  </datalist>
                </label>
                <label>
                  Budget per hire (annually)
                  <input
                    type="text"
                    value={form.budget}
                    onChange={(e) => update('budget', e.target.value)}
                    placeholder="e.g. $180k base + equity"
                    autoComplete="off"
                  />
                </label>
              </div>
              <label>
                Notes (optional)
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                  placeholder="Anything we should know? Timeline, must-haves, preferred call times…"
                />
              </label>
              {err && <div className="error-banner">{err}</div>}
              <button type="submit" disabled={busy} className="btn-pill btn-pill-primary btn-pill-lg btn-block">
                {busy ? 'Sending…' : 'Submit and schedule'}
              </button>
              <p className="muted small text-center">
                You won't be charged anything now. <strong>Pay $10k only after you hire.</strong>
              </p>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
