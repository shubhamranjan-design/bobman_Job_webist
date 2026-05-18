import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function SkillsModal({ maskedName, skills, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card skills-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-head">
          <h2>Skills &amp; tools</h2>
          <p className="muted">
            {maskedName && <span className="skills-modal-name">{maskedName}</span>}
            &nbsp;·&nbsp;{skills.length} skill{skills.length !== 1 ? 's' : ''} on file
          </p>
        </div>
        <div className="skills-modal-body">
          <div className="skill-cloud">
            {skills.map((s, i) => (
              <span key={i} className="skill-chip">{s}</span>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
