import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { getShortlist, removeFromShortlist, onShortlistChange, clearShortlist } from '../utils/shortlist';
import { isSubmitted, onSubmittedChange } from '../utils/submitted';
import InquiryFormModal from './InquiryFormModal';

export default function ShortlistDrawer() {
  const [open, setOpen] = useState(false);
  const [showInquiry, setShowInquiry] = useState(false);
  const [maskedIds, setMaskedIds] = useState(getShortlist());
  const [details, setDetails] = useState({}); // maskedId -> brief detail
  const [, setSubmittedTick] = useState(0);

  useEffect(() => {
    return onShortlistChange(setMaskedIds);
  }, []);

  useEffect(() => onSubmittedChange(() => setSubmittedTick((x) => x + 1)), []);

  // Pending (not yet submitted) candidates — only these get sent in the next inquiry.
  const pendingIds = maskedIds.filter((m) => !isSubmitted(m));
  const submittedCount = maskedIds.length - pendingIds.length;

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('bc:open-shortlist', onOpen);
    return () => window.removeEventListener('bc:open-shortlist', onOpen);
  }, []);

  // Close drawer (or nested inquiry modal) on Escape
  useEffect(() => {
    if (!open && !showInquiry) return;
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (showInquiry) setShowInquiry(false);
      else setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, showInquiry]);

  // Lazy-load details for shortlist items (cached in catalog endpoint already)
  useEffect(() => {
    if (!open || maskedIds.length === 0) return;
    let cancelled = false;
    api.getCatalog({ limit: 500 }).then((r) => {
      if (cancelled) return;
      const map = {};
      for (const c of (r.items || [])) {
        if (maskedIds.includes(c.masked_id)) map[c.masked_id] = c;
      }
      setDetails(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, maskedIds]);

  function close() { setOpen(false); }

  // Map masked -> approximate UUID for inquiry submission.
  // We need the real UUIDs server-side, but we don't store them client-side.
  // Workaround: fetch them on submit via the catalog endpoint AGAIN (already cached server-side)
  // For now, we'll resolve at submit time inside InquiryFormModal.

  if (!open) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={close} />
      <aside className="shortlist-drawer" role="dialog" aria-label="Shortlisted candidates">
        <div className="drawer-head">
          <h3>Your shortlist</h3>
          <button className="drawer-close" onClick={close} aria-label="Close">✕</button>
        </div>
        <div className="drawer-body">
          {maskedIds.length === 0 ? (
            <div className="drawer-empty">
              <div className="drawer-empty-emoji">🤖</div>
              <p>Your shortlist is empty.</p>
              <p className="muted small">Browse candidates below and click "Add to shortlist" to build your list.</p>
            </div>
          ) : (
            <ul className="shortlist-list">
              {maskedIds.map((mid) => {
                const c = details[mid];
                return (
                  <li key={mid} className="shortlist-item">
                    <div className="shortlist-avatar">{c?.initials || (mid.split('-')[1] || '??').slice(0, 2)}</div>
                    <div className="shortlist-item-main">
                      <div className="shortlist-mid">
                        {c?.masked_name || 'Loading…'}
                        {isSubmitted(mid) && <span className="submitted-badge sm">✓ Submitted</span>}
                      </div>
                      {c ? (
                        <div className="shortlist-meta">
                          <span className="muted">{c.role_name}</span>
                        </div>
                      ) : (
                        <div className="shortlist-meta muted">Loading details…</div>
                      )}
                    </div>
                    <Link to={`/c/${mid}`} className="link-sm" onClick={close}>View more</Link>
                    <button className="icon-btn" onClick={() => removeFromShortlist(mid)} aria-label="Remove">✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {maskedIds.length > 0 && (
          <div className="drawer-foot">
            {submittedCount > 0 && (
              <div className="drawer-foot-note">
                {submittedCount} already submitted · {pendingIds.length} pending
              </div>
            )}
            <div className="drawer-foot-row">
              <button className="btn-pill btn-pill-ghost btn-pill-sm" onClick={clearShortlist}>Clear all</button>
              <button
                className="btn-pill btn-pill-primary btn-pill-lg btn-block"
                onClick={() => setShowInquiry(true)}
                disabled={pendingIds.length === 0}
              >
                {pendingIds.length === 0
                  ? 'All shortlisted candidates already submitted'
                  : <>Schedule Interview{pendingIds.length === 1 ? '' : 's'} ({pendingIds.length}) <span className="arrow">→</span></>}
              </button>
            </div>
          </div>
        )}
      </aside>
      {showInquiry && (
        <InquiryFormModal
          maskedIds={pendingIds}
          onClose={() => setShowInquiry(false)}
          onSubmitted={() => { setShowInquiry(false); close(); }}
        />
      )}
    </>
  );
}
