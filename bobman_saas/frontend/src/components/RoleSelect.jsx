import { useEffect, useRef, useState } from 'react';

/**
 * Single-select dropdown with custom styling.
 * Options: [{ value: string, label: string }]
 */
export default function RoleSelect({ value, onChange, options, placeholder = 'Select…', className = '' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`role-select ${className}`} ref={wrapRef}>
      <button
        type="button"
        className={`role-select-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((x) => !x)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="role-select-value">
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`role-select-chev ${open ? 'open' : ''}`}
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="role-select-menu" role="listbox">
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value || 'all'}
                role="option"
                aria-selected={active}
                title={opt.label}
                className={`role-select-opt ${active ? 'active' : ''}`}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                <span className="role-select-opt-label">{opt.label}</span>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
