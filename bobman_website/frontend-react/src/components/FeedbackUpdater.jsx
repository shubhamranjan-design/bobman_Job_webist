import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { updateFeedbackStatus } from '../utils/api';

const FEEDBACK_OPTIONS_DEFAULT = [
  'Follow Up Pending',
  'Not answering',
  'Calling Attempts Exhausted',
  'Not interested',
  'High Notice',
  'High Expectations',
  'Long Gap',
  'Less Experience',
  'Skills Mismatch',
  'Internal Recruiter Screen Rejected',
  'Selected by Client (Other Vendor)',
  'Client Interview Rejected',
  'Client Interviewed',
  'Submitted to client',
  'Client Sharable but Role on Hold',
  'Selected by Client',
  'Internal Testing',
  'Role Closed No Feedback',
  'Role Paused No Feedback',
];

const FEEDBACK_OPTIONS_AWIGN_CORE = [
  'Not answering',
  'Not interested',
  'High Notice',
  'High Expectations',
  'Long Gap',
  'Less Experience',
  'Skills Mismatch',
  'Internal Recruiter Screen Rejected',
  'Submitted to Hiring Manager',
  'Hiring Manager Select',
  'Hiring Manager Reject',
  'Round 1 Scheduled',
  'Round 1 Reject',
  'Round 2 Scheduled',
  'Round 2 Reject',
  'Round 3 Scheduled',
  'Round 3 Reject',
  'Final Select',
];

// Admin gets all options (default + awign_core extras)
const FEEDBACK_OPTIONS_ADMIN = [
  ...FEEDBACK_OPTIONS_DEFAULT,
  'Submitted to Hiring Manager',
  'Hiring Manager Select',
  'Hiring Manager Reject',
  'Round 1 Scheduled',
  'Round 1 Reject',
  'Round 2 Scheduled',
  'Round 2 Reject',
  'Round 3 Scheduled',
  'Round 3 Reject',
  'Final Select',
];

const FEEDBACK_OPTIONS = FEEDBACK_OPTIONS_DEFAULT;

const getFeedbackOptions = (userEmail) => {
  if (userEmail === 'awign_core@awign.com') return FEEDBACK_OPTIONS_AWIGN_CORE;
  if (userEmail === 'admin@awign.com') return FEEDBACK_OPTIONS_ADMIN;
  return FEEDBACK_OPTIONS_DEFAULT;
};

// Toast notification component
const Toast = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: 'fixed', top: 20, right: 20, zIndex: 10001,
        background: '#00b894', color: '#fff', padding: '12px 20px',
        borderRadius: 8, fontSize: 13, fontWeight: 600,
        boxShadow: '0 4px 16px rgba(0,184,148,0.4)',
        display: 'flex', alignItems: 'center', gap: 8,
        animation: 'slideInRight 0.3s ease-out',
      }}
    >
      <span style={{ fontSize: 16 }}>&#10003;</span>
      {message}
    </div>,
    document.body
  );
};

const FeedbackUpdater = ({ userId, currentStatus, onUpdated, userEmail }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState('');
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [displayStatus, setDisplayStatus] = useState(currentStatus);
  const [toast, setToast] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);

  // Sync displayStatus if parent changes currentStatus
  useEffect(() => {
    setDisplayStatus(currentStatus);
  }, [currentStatus]);

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (showDropdown && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 300;
      // Open below if space, otherwise above
      if (spaceBelow >= dropdownHeight || spaceBelow >= rect.top) {
        setDropdownPos({ top: rect.bottom + 2, left: rect.left });
      } else {
        setDropdownPos({ top: rect.top - dropdownHeight - 2, left: rect.left });
      }
    }
  }, [showDropdown]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (showDropdown && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 10);
    }
  }, [showDropdown]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  // Reposition dropdown on scroll (parent containers scrolling)
  useEffect(() => {
    if (!showDropdown) return;
    const handleScroll = (e) => {
      // Ignore scrolling inside the dropdown itself
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      // Reposition based on current trigger location
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        if (rect.top < -20 || rect.bottom > window.innerHeight + 20) {
          setShowDropdown(false);
          setSearch('');
        } else {
          const spaceBelow = window.innerHeight - rect.bottom;
          const top = spaceBelow >= 300 || spaceBelow >= rect.top ? rect.bottom + 2 : rect.top - 300 - 2;
          setDropdownPos({ top, left: rect.left });
        }
      }
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [showDropdown]);

  const handleSelect = (opt) => {
    if (opt === displayStatus) {
      setShowDropdown(false);
      setSearch('');
      return;
    }
    setPendingStatus(opt);
    setComments('');
    setShowDropdown(false);
    setSearch('');
    setShowModal(true);
  };

  const handleClearStatus = () => {
    setPendingStatus('');
    setShowDropdown(false);
    setSearch('');
    setShowModal(true);
  };

  const handleConfirm = async (e) => {
    e.stopPropagation();
    setSaving(true);
    try {
      const statusToSave = pendingStatus || null;
      await updateFeedbackStatus(userId, statusToSave, comments.trim() || null);
      setDisplayStatus(statusToSave);
      setShowModal(false);
      setToast(statusToSave ? `Status updated to "${statusToSave}"` : 'Status cleared');
      if (onUpdated) onUpdated(userId, statusToSave, comments.trim() || null);
    } catch (err) {
      alert('Failed to update: ' + err.message);
    }
    setSaving(false);
  };

  const handleCancel = useCallback((e) => {
    e?.stopPropagation();
    setShowModal(false);
    setPendingStatus('');
    setComments('');
  }, []);

  // Close modal on outside click
  useEffect(() => {
    if (!showModal) return;
    const handleClick = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        handleCancel(e);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showModal, handleCancel]);

  const statusColor = (s) => {
    if (!s) return '#999';
    const l = s.toLowerCase();
    if (l.includes('selected by client') && !l.includes('other')) return '#00b894';
    if (l.includes('submitted') || l.includes('client interviewed')) return '#0984e3';
    if (l.includes('rejected') || l.includes('not interested') || l.includes('mismatch')) return '#e94560';
    if (l.includes('hold') || l.includes('paused') || l.includes('closed')) return '#636e72';
    if (l.includes('pending') || l.includes('not answering') || l.includes('exhausted')) return '#e17055';
    return '#555';
  };

  const activeOptions = getFeedbackOptions(userEmail);
  const filtered = activeOptions.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {/* Toast notification */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* Trigger button */}
      <div
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }}
        style={{
          fontSize: 9, padding: '2px 8px 2px 4px', border: '1px solid #ddd',
          borderRadius: 4, background: '#fff', color: statusColor(displayStatus),
          fontWeight: 600, cursor: 'pointer', maxWidth: 160, minWidth: 90,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {displayStatus || 'Set Status'}
        </span>
        <span style={{ fontSize: 7, color: '#999', flexShrink: 0 }}>&#9660;</span>
      </div>

      {/* Dropdown - rendered as portal to avoid overflow clipping */}
      {showDropdown && createPortal(
        <div
          ref={dropdownRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            background: '#fff', border: '1px solid #ddd', borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 10000,
            minWidth: 220, maxHeight: 300, display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search status..."
              style={{
                width: '100%', padding: '5px 8px', border: '1px solid #ddd',
                borderRadius: 4, fontSize: 11, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          {/* Options */}
          <div style={{ overflowY: 'auto', maxHeight: 240 }}>
            {/* Null / Clear option */}
            {!search && displayStatus && (
              <div
                onClick={handleClearStatus}
                style={{
                  padding: '7px 12px', fontSize: 11, cursor: 'pointer',
                  color: '#999', fontStyle: 'italic', borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Clear Status (Null)
              </div>
            )}
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 11, color: '#999', textAlign: 'center' }}>
                No matching status
              </div>
            ) : (
              filtered.map(opt => (
                <div
                  key={opt}
                  onClick={() => handleSelect(opt)}
                  style={{
                    padding: '7px 12px', fontSize: 11, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: opt === displayStatus ? '#e8f4fc' : 'transparent',
                    color: statusColor(opt), fontWeight: opt === displayStatus ? 600 : 400,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                  onMouseLeave={(e) => e.currentTarget.style.background = opt === displayStatus ? '#e8f4fc' : 'transparent'}
                >
                  {opt === displayStatus && <span style={{ fontSize: 10, color: '#0984e3' }}>&#10003;</span>}
                  {opt}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation modal */}
      {showModal && createPortal(
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            ref={modalRef}
            style={{
              background: '#fff', borderRadius: 10, padding: 24,
              width: 420, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 15, color: '#16213e' }}>
              {pendingStatus ? 'Update Feedback Status' : 'Clear Feedback Status'}
            </h3>
            <div style={{ fontSize: 12, marginBottom: 16, color: '#636e72' }}>
              {pendingStatus ? (
                <>Changing to: <strong style={{ color: statusColor(pendingStatus) }}>{pendingStatus}</strong></>
              ) : (
                <>Clearing status to <strong style={{ color: '#999' }}>Null</strong></>
              )}
            </div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#333' }}>
              Recruiter Comments <span style={{ fontWeight: 400, color: '#999' }}>(optional)</span>
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add any notes or comments about this candidate..."
              rows={4}
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                borderRadius: 6, fontSize: 12, resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancel}
                style={{
                  padding: '8px 18px', border: '1px solid #ddd', borderRadius: 6,
                  background: '#f8f9fa', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                style={{
                  padding: '8px 18px', border: 'none', borderRadius: 6,
                  background: pendingStatus ? '#0984e3' : '#e94560', color: '#fff',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 12, fontWeight: 600, opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export { FEEDBACK_OPTIONS, getFeedbackOptions };
export default FeedbackUpdater;
