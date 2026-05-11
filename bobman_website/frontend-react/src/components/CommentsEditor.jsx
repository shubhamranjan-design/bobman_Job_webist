import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { updateRecruiterComments } from '../utils/api';

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return createPortal(
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 10001,
      background: type === 'error' ? '#e94560' : '#00b894', color: '#fff',
      padding: '12px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
      boxShadow: `0 4px 16px rgba(${type === 'error' ? '233,69,96' : '0,184,148'},0.4)`,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ fontSize: 16 }}>{type === 'error' ? '\u2717' : '\u2713'}</span>
      {message}
    </div>,
    document.body
  );
};

const CommentsEditor = ({ userId, currentComments, onUpdated, compact = false }) => {
  const [showModal, setShowModal] = useState(false);
  const [value, setValue] = useState(currentComments || '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [displayComments, setDisplayComments] = useState(currentComments);
  const modalRef = useRef(null);

  useEffect(() => {
    setDisplayComments(currentComments);
  }, [currentComments]);

  const openModal = (e) => {
    e?.stopPropagation();
    setValue(displayComments || '');
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.stopPropagation();
    setSaving(true);
    try {
      const commentToSave = value.trim() || null;
      await updateRecruiterComments(userId, commentToSave);
      setDisplayComments(commentToSave);
      setShowModal(false);
      setToast({ message: commentToSave ? 'Comments updated' : 'Comments cleared', type: 'success' });
      if (onUpdated) onUpdated(userId, commentToSave);
    } catch (err) {
      setToast({ message: 'Failed: ' + err.message, type: 'error' });
    }
    setSaving(false);
  };

  const handleClear = async (e) => {
    e.stopPropagation();
    setSaving(true);
    try {
      await updateRecruiterComments(userId, null);
      setDisplayComments(null);
      setValue('');
      setShowModal(false);
      setToast({ message: 'Comments cleared', type: 'success' });
      if (onUpdated) onUpdated(userId, null);
    } catch (err) {
      setToast({ message: 'Failed: ' + err.message, type: 'error' });
    }
    setSaving(false);
  };

  const handleCancel = useCallback((e) => {
    e?.stopPropagation();
    setShowModal(false);
  }, []);

  useEffect(() => {
    if (!showModal) return;
    const handleClick = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) handleCancel(e);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showModal, handleCancel]);

  if (compact) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <div
          onClick={openModal}
          style={{
            fontSize: 9, padding: '2px 8px', border: '1px solid #ddd',
            borderRadius: 4, background: '#fff', cursor: 'pointer',
            maxWidth: 160, minWidth: 60, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'space-between', gap: 4,
            color: displayComments ? '#444' : '#999', fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          title={displayComments || 'Click to add comments'}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayComments ? (displayComments.length > 20 ? displayComments.slice(0, 20) + '...' : displayComments) : 'Add comment'}
          </span>
          <span style={{ fontSize: 8, color: '#999', flexShrink: 0 }}>&#9998;</span>
        </div>
        {showModal && <CommentModal
          modalRef={modalRef}
          value={value}
          setValue={setValue}
          saving={saving}
          displayComments={displayComments}
          onSave={handleSave}
          onClear={handleClear}
          onCancel={handleCancel}
        />}
      </>
    );
  }

  // Full view (detail page)
  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div style={{ marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong>Comments:</strong>
          <button
            onClick={openModal}
            style={{
              fontSize: 10, padding: '2px 10px', border: '1px solid #ddd',
              borderRadius: 4, background: '#fff', cursor: 'pointer',
              color: '#0984e3', fontWeight: 600,
            }}
          >
            {displayComments ? 'Edit' : 'Add'}
          </button>
        </div>
        {displayComments && (
          <div style={{
            marginTop: 2, padding: '6px 10px', background: '#f8f9fa',
            borderRadius: 6, fontSize: 11, lineHeight: 1.5, color: '#444',
            whiteSpace: 'pre-wrap',
          }}>
            {displayComments}
          </div>
        )}
      </div>
      {showModal && <CommentModal
        modalRef={modalRef}
        value={value}
        setValue={setValue}
        saving={saving}
        displayComments={displayComments}
        onSave={handleSave}
        onClear={handleClear}
        onCancel={handleCancel}
      />}
    </>
  );
};

const CommentModal = ({ modalRef, value, setValue, saving, displayComments, onSave, onClear, onCancel }) => {
  return createPortal(
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
          width: 460, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#16213e' }}>
          Edit Recruiter Comments
        </h3>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add recruiter comments about this candidate..."
          rows={5}
          autoFocus
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #ddd',
            borderRadius: 6, fontSize: 12, resize: 'vertical',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'space-between' }}>
          <div>
            {displayComments && (
              <button
                onClick={onClear}
                disabled={saving}
                style={{
                  padding: '8px 16px', border: '1px solid #e94560', borderRadius: 6,
                  background: '#fff', color: '#e94560', cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 12, fontWeight: 600, opacity: saving ? 0.6 : 1,
                }}
              >
                Clear (Set Null)
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onCancel}
              style={{
                padding: '8px 18px', border: '1px solid #ddd', borderRadius: 6,
                background: '#f8f9fa', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              style={{
                padding: '8px 18px', border: 'none', borderRadius: 6,
                background: '#0984e3', color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 600, opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommentsEditor;
