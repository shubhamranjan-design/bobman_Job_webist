import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const MultiSelect = ({
  options = [],
  selected = [],
  onChange,
  placeholder = 'All',
  allLabel = 'All'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, minWidth: 200 });
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  // Calculate position when dropdown opens
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 300;
      const top = spaceBelow >= dropdownHeight || spaceBelow >= rect.top
        ? rect.bottom + 1
        : rect.top - dropdownHeight - 1;
      setDropdownPos({ top, left: rect.left, minWidth: Math.max(rect.width, 200) });
    }
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  // Reposition on scroll (close if trigger scrolls out of view)
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.top < -20 || rect.bottom > window.innerHeight + 20) {
          setIsOpen(false);
          setSearch('');
        } else {
          const spaceBelow = window.innerHeight - rect.bottom;
          const top = spaceBelow >= 300 || spaceBelow >= rect.top ? rect.bottom + 1 : rect.top - 300 - 1;
          setDropdownPos({ top, left: rect.left, minWidth: Math.max(rect.width, 200) });
        }
      }
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  const isNoneMode = selected.includes('__NONE__');
  const isAllMode = selected.length === 0;
  const actualSelected = selected.filter(v => v !== '__NONE__');

  const getDisplayText = () => {
    if (isAllMode) return placeholder;
    if (isNoneMode) return '0 selected';
    if (actualSelected.length === 1) {
      const val = actualSelected[0];
      return val.length > 20 ? val.substring(0, 20) + '...' : val;
    }
    return `${actualSelected.length} selected`;
  };

  const handleToggleAll = (e) => {
    e.stopPropagation();
    if (isAllMode) {
      onChange(['__NONE__']);
    } else {
      onChange([]);
    }
  };

  const handleToggleOption = (e, value) => {
    e.stopPropagation();
    let newSelected;

    if (isNoneMode) {
      newSelected = [value];
    } else if (isAllMode) {
      newSelected = options.filter(v => v !== value);
    } else {
      if (actualSelected.includes(value)) {
        newSelected = actualSelected.filter(v => v !== value);
        if (newSelected.length === 0) {
          newSelected = ['__NONE__'];
        }
      } else {
        newSelected = [...actualSelected, value];
        if (newSelected.length === options.length) {
          newSelected = [];
        }
      }
    }
    onChange(newSelected);
  };

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="multi-select" ref={containerRef}>
      <div
        className="multi-select-header"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="multi-select-text">{getDisplayText()}</span>
        <span className="multi-select-arrow">&#9660;</span>
      </div>
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            minWidth: dropdownPos.minWidth,
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
            maxHeight: 300,
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #eee', background: '#fff', borderRadius: '6px 6px 0 0' }}>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => { e.stopPropagation(); setSearch(e.target.value); }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Search..."
              style={{
                width: '100%', padding: '5px 8px', border: '1px solid #ddd',
                borderRadius: 4, fontSize: 11, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 250 }}>
            {/* All option - only show when not searching */}
            {!search && (
              <div
                className={`multi-select-option ${isAllMode ? 'selected' : ''}`}
                onClick={handleToggleAll}
              >
                <span className="checkmark">{isAllMode ? '✓' : ''}</span>
                <span>{allLabel}</span>
              </div>
            )}
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 11, color: '#999', textAlign: 'center' }}>
                No matches
              </div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = isAllMode ? true : actualSelected.includes(opt);
                return (
                  <div
                    key={opt}
                    className={`multi-select-option ${isSelected ? 'selected' : ''}`}
                    onClick={(e) => handleToggleOption(e, opt)}
                  >
                    <span className="checkmark">{isSelected ? '✓' : ''}</span>
                    <span>{opt}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default MultiSelect;
