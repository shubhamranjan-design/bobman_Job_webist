import React, { useState, useEffect, useMemo } from 'react';
import MultiSelect from './MultiSelect';
import { fetchRecruiterSummary, fetchUserFilterOptions } from '../utils/api';

const STORAGE_KEY = 'recruiter_summary_filters';

const STAGE_OPTIONS = [
  'Total Qualified',
  'Interested',
  'Match No Interest',
  '80+ No Match',
  'Screening Passed',
];

const ConfirmModal = ({ open, title, message, onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
      onClick={onCancel}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', minWidth: 340, maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', textAlign: 'center' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>&#128269;</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: '#1a1a2e' }}>{title}</div>
        <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5, marginBottom: 22 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel}
            style={{ padding: '8px 22px', borderRadius: 8, border: '1px solid #ddd', background: '#f5f5f5', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#555' }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            View in User Lookup
          </button>
        </div>
      </div>
    </div>
  );
};

const RecruiterSummaryTab = ({ onNavigateToUserLookup, lockedFilters }) => {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];

  const saved = (() => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
  })();

  const [dateFrom, setDateFrom] = useState(saved.dateFrom || weekAgo);
  const [dateTo, setDateTo] = useState(saved.dateTo || today);
  const [userStage, setUserStage] = useState(saved.userStage || 'Total Qualified');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState(saved.selectedStatuses || []);
  const [showPercentage, setShowPercentage] = useState(saved.showPercentage ?? true);
  const [sortBy, setSortBy] = useState(saved.sortBy || null);
  const [sortDir, setSortDir] = useState(saved.sortDir || 'desc');

  // Filter options from API
  const [filterOpts, setFilterOpts] = useState({ data_tags: [], team_managers: [], recruiters: [] });
  // Selected filters — default Data Tag = ['naukri'] (or locked value)
  const [selDataTag, setSelDataTag] = useState(lockedFilters?.data_team_tag || saved.selDataTag || ['naukri']);
  const [selPod, setSelPod] = useState(saved.selPod || []);
  const [selRecruiter, setSelRecruiter] = useState(saved.selRecruiter || []);
  const [qualFilter, setQualFilter] = useState(saved.qualFilter || '');

  // Fetch filter options on mount
  useEffect(() => {
    fetchUserFilterOptions().then(opts => {
      setFilterOpts({
        data_tags: opts.data_tags || [],
        team_managers: opts.team_managers || [],
        recruiters: opts.recruiters || [],
      });
    }).catch(() => {});
  }, []);

  // Persist filters
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      dateFrom, dateTo, userStage, selectedStatuses, showPercentage, sortBy, sortDir,
      selDataTag, selPod, selRecruiter, qualFilter
    }));
  }, [dateFrom, dateTo, userStage, selectedStatuses, showPercentage, sortBy, sortDir, selDataTag, selPod, selRecruiter, qualFilter]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {};
      if (selDataTag.length > 0) filters.data_team_tag = selDataTag;
      if (selPod.length > 0) filters.team_manager_email = selPod;
      if (selRecruiter.length > 0) filters.recruiter_email = selRecruiter;
      if (qualFilter) filters.qualification_filter = qualFilter;
      const result = await fetchRecruiterSummary(dateFrom, dateTo, userStage, filters);
      setData(result);
    } catch (e) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Load only on mount; subsequent loads via Refresh button
  useEffect(() => { loadData(); }, []);

  const statusOptions = useMemo(() => {
    if (!data?.statuses) return [];
    return data.statuses;
  }, [data?.statuses]);

  const activeStatuses = useMemo(() => {
    if (!data?.statuses) return [];
    if (selectedStatuses.length === 0) return data.statuses;
    return data.statuses.filter(s => selectedStatuses.includes(s));
  }, [data?.statuses, selectedStatuses]);

  const { rows, colTotals, grandTotal } = useMemo(() => {
    if (!data?.rows) return { rows: [], colTotals: {}, grandTotal: 0 };

    let filteredRows = data.rows.map(r => {
      let rowTotal = 0;
      for (const st of activeStatuses) {
        rowTotal += (r.counts[st] || 0);
      }
      return { ...r, filteredTotal: rowTotal };
    });

    if (sortBy) {
      filteredRows.sort((a, b) => {
        let va, vb;
        if (sortBy === 'pod_name' || sortBy === 'recruiter_email') {
          va = (a[sortBy] || '').toLowerCase();
          vb = (b[sortBy] || '').toLowerCase();
          return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        } else if (sortBy === 'total') {
          va = a.filteredTotal;
          vb = b.filteredTotal;
        } else {
          va = a.counts[sortBy] || 0;
          vb = b.counts[sortBy] || 0;
        }
        return sortDir === 'asc' ? va - vb : vb - va;
      });
    }

    const ct = {};
    let gt = 0;
    for (const st of activeStatuses) {
      ct[st] = filteredRows.reduce((sum, r) => sum + (r.counts[st] || 0), 0);
      gt += ct[st];
    }

    return { rows: filteredRows, colTotals: ct, grandTotal: gt };
  }, [data?.rows, activeStatuses, sortBy, sortDir]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const sortArrow = (col) => {
    if (sortBy !== col) return ' \u2195';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const pct = (val, base) => {
    if (!base || !val) return '';
    return ((val / base) * 100).toFixed(1) + '%';
  };

  const [confirmModal, setConfirmModal] = useState(null);

  const handleCellClick = (recruiterEmailFull, status, count) => {
    if (!count || !onNavigateToUserLookup) return;
    const recruiterShort = recruiterEmailFull === '(unassigned)' ? '(unassigned)' : recruiterEmailFull.split('@')[0];
    setConfirmModal({
      title: 'Open in User Lookup?',
      message: `View ${count} user(s) with "${status}" status for ${recruiterShort} in the User Lookup tab with matching filters applied.`,
      payload: {
        recruiterEmail: recruiterEmailFull !== '(unassigned)' ? recruiterEmailFull : '',
        feedbackStatus: status,
        dateFrom,
        dateTo,
        dataTeamTag: selDataTag,
        userStage,
      },
    });
  };

  const handleConfirmNav = () => {
    if (confirmModal?.payload) onNavigateToUserLookup(confirmModal.payload);
    setConfirmModal(null);
  };

  const cellStyle = { padding: '6px 10px', textAlign: 'center', fontSize: '12px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' };
  const headerStyle = { ...cellStyle, fontWeight: 700, background: '#1a1a2e', color: '#fff', borderBottom: '2px solid #333', position: 'sticky', top: 0, zIndex: 2, cursor: 'pointer', userSelect: 'none' };
  const totalRowStyle = { ...cellStyle, fontWeight: 700, background: '#f0f3ff', borderTop: '2px solid #333' };

  return (
    <div>
      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title}
        message={confirmModal?.message}
        onConfirm={handleConfirmNav}
        onCancel={() => setConfirmModal(null)}
      />
      {/* Filters Bar */}
      <div className="table-wrapper" style={{ marginBottom: '15px', padding: '15px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="filter-group">
            <label style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, display: 'block' }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }} />
          </div>
          <div className="filter-group">
            <label style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, display: 'block' }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }} />
          </div>
          <div className="filter-group">
            <label style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, display: 'block' }}>User Stage</label>
            <select value={userStage} onChange={e => setUserStage(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, minWidth: 140 }}>
              {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, display: 'block' }}>Qual. Time</label>
            <select value={qualFilter} onChange={e => setQualFilter(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, minWidth: 140 }}>
              <option value="">All</option>
              <option value="yesterday_before_cutoff">&le; Yesterday 7 PM IST</option>
              <option value="yesterday_after_cutoff">After Yesterday 7 PM IST</option>
              <option value="before_cutoff">&le; Today 7 PM IST</option>
              <option value="after_cutoff">After Today 7 PM IST</option>
            </select>
          </div>
          <div className="filter-group" style={{ position: 'relative', zIndex: 40 }}>
            <label style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, display: 'block' }}>Data Tag</label>
            {lockedFilters?.data_team_tag ? (
              <span className="locked-filter-value">{lockedFilters.data_team_tag.join(', ')}</span>
            ) : (
              <MultiSelect
                options={filterOpts.data_tags}
                selected={selDataTag}
                onChange={setSelDataTag}
                placeholder="All Tags"
                allLabel="All"
              />
            )}
          </div>
          <div className="filter-group" style={{ position: 'relative', zIndex: 35 }}>
            <label style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, display: 'block' }}>Pod (Manager)</label>
            <MultiSelect
              options={filterOpts.team_managers}
              selected={selPod}
              onChange={setSelPod}
              placeholder="All Pods"
              allLabel="All"
            />
          </div>
          <div className="filter-group" style={{ position: 'relative', zIndex: 32 }}>
            <label style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, display: 'block' }}>Recruiter</label>
            <MultiSelect
              options={filterOpts.recruiters}
              selected={selRecruiter}
              onChange={setSelRecruiter}
              placeholder="All Recruiters"
              allLabel="All"
            />
          </div>
          <div className="filter-group" style={{ position: 'relative', zIndex: 30 }}>
            <label style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, display: 'block' }}>Feedback Status</label>
            <MultiSelect
              options={statusOptions}
              selected={selectedStatuses}
              onChange={setSelectedStatuses}
              placeholder="All Statuses"
              allLabel="All"
            />
          </div>
          <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
            <label style={{ fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={showPercentage} onChange={e => setShowPercentage(e.target.checked)} />
              Show %
            </label>
          </div>
          <button className="btn btn-primary btn-sm" onClick={loadData} disabled={loading}
            style={{ padding: '5px 15px', fontSize: 12 }}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div style={{ padding: 15, color: '#e94560', fontWeight: 600 }}>{error}</div>}

      {loading && !data && <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>Loading...</div>}

      {data && (
        <div className="table-wrapper">
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #eee', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Recruiter Feedback Summary ({userStage})</h3>
            <span style={{ fontSize: 11, color: '#888' }}>
              {rows.length} recruiters &middot; {grandTotal} total users &middot; {activeStatuses.length} status columns
            </span>
          </div>

          <div className="table-scroll" style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...headerStyle, textAlign: 'left', position: 'sticky', left: 0, zIndex: 3, minWidth: 110, maxWidth: 140 }}
                    onClick={() => handleSort('pod_name')}>
                    POD Name{sortArrow('pod_name')}
                  </th>
                  <th style={{ ...headerStyle, textAlign: 'left', position: 'sticky', left: 110, zIndex: 3, minWidth: 110, maxWidth: 140 }}
                    onClick={() => handleSort('recruiter_email')}>
                    Recruiter{sortArrow('recruiter_email')}
                  </th>
                  {activeStatuses.map(st => (
                    <th key={st} style={headerStyle} onClick={() => handleSort(st)}>
                      {st}{sortArrow(st)}
                    </th>
                  ))}
                  <th style={{ ...headerStyle, background: '#2d3436' }} onClick={() => handleSort('total')}>
                    Total{sortArrow('total')}
                  </th>
                </tr>
                {/* Column totals row */}
                <tr>
                  <td style={{ ...totalRowStyle, textAlign: 'left', fontWeight: 700, position: 'sticky', left: 0, zIndex: 2, background: '#e8ecf1' }}>
                    Total
                  </td>
                  <td style={{ ...totalRowStyle, position: 'sticky', left: 110, zIndex: 2, background: '#e8ecf1' }}></td>
                  {activeStatuses.map(st => (
                    <td key={st} style={{ ...totalRowStyle, background: '#e8ecf1' }}>
                      <div style={{ fontWeight: 700 }}>{colTotals[st] || 0}</div>
                      {showPercentage && grandTotal > 0 && (
                        <div style={{ fontSize: 10, color: '#666' }}>{pct(colTotals[st], grandTotal)}</div>
                      )}
                    </td>
                  ))}
                  <td style={{ ...totalRowStyle, background: '#d5dbe5', fontWeight: 700, fontSize: 14 }}>{grandTotal}</td>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const bg = idx % 2 === 0 ? '#fff' : '#fafbfc';
                  return (
                    <tr key={idx} style={{ background: bg }}>
                      <td style={{ ...cellStyle, textAlign: 'left', position: 'sticky', left: 0, background: bg, zIndex: 1, fontSize: 11, color: '#555', minWidth: 110, maxWidth: 140 }}>
                        {r.pod_name || '-'}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'left', position: 'sticky', left: 110, background: bg, zIndex: 1, fontWeight: 600, minWidth: 110, maxWidth: 140 }}>
                        {r.recruiter_email}
                      </td>
                      {activeStatuses.map(st => {
                        const val = r.counts[st] || 0;
                        const clickable = val > 0 && onNavigateToUserLookup;
                        return (
                          <td key={st}
                            style={{ ...cellStyle, color: val > 0 ? '#222' : '#ccc', cursor: clickable ? 'pointer' : 'default' }}
                            onClick={clickable ? () => handleCellClick(r.recruiter_email_full, st, val) : undefined}
                            title={clickable ? `Click to view in User Lookup` : ''}
                          >
                            <div style={clickable ? { textDecoration: 'underline', textDecorationColor: '#aaa' } : {}}>{val}</div>
                            {showPercentage && r.filteredTotal > 0 && val > 0 && (
                              <div style={{ fontSize: 10, color: '#888' }}>{pct(val, r.filteredTotal)}</div>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ ...cellStyle, fontWeight: 700, background: '#f8f9fa' }}>
                        {r.filteredTotal}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecruiterSummaryTab;
