import { useState } from 'react';

const ALL_METRICS = [
  { key: 'users', label: 'Users' },
  { key: 'call_connected_users', label: 'Connected' },
  { key: 'profiling_calling', label: 'Prof(Call)' },
  { key: 'call_gt_4min', label: '>=4min' },
  { key: 'profile_80plus', label: '80%+' },
  { key: 'users_with_inbound', label: 'WA Inbound' },
  { key: 'profiling_linkedin_cv', label: 'Prof(LI/CV)' },
  { key: 'matching_job_found', label: 'Job Match' },
  { key: 'profile_80_no_match', label: '80%+ No Match' },
  { key: 'match_no_interest', label: 'Match No Interest' },
  { key: 'interest_shown', label: 'Interested' },
  { key: 'total_qualified_leads', label: 'Total Qualified' }
];

const DEFAULT_FUNNEL_ORDER = [
  'users', 'call_connected_users', 'profiling_calling', 'call_gt_4min',
  'profile_80plus', 'users_with_inbound', 'profiling_linkedin_cv',
  'matching_job_found', 'profile_80_no_match', 'match_no_interest',
  'interest_shown', 'total_qualified_leads'
];

// Props:
//   data: the data object with metric keys
//   title: funnel title
//   selectedMetrics / onMetricsChange: controlled metrics (optional - uses internal state if not provided)
//   drilldown / onDrilldownChange: controlled drilldown toggle (optional)
//   hideControls: if true, hide metric chips and toggle (for side-by-side display)
const ConversionFunnel = ({
  data,
  title = 'Conversion Funnel',
  selectedMetrics: externalMetrics,
  onMetricsChange,
  drilldown: externalDrilldown,
  onDrilldownChange,
  hideControls = false
}) => {
  const [internalDrilldown, setInternalDrilldown] = useState(false);
  const [internalMetrics, setInternalMetrics] = useState([...DEFAULT_FUNNEL_ORDER]);

  // Use external state if provided, otherwise internal
  const drilldown = externalDrilldown !== undefined ? externalDrilldown : internalDrilldown;
  const setDrilldown = onDrilldownChange || setInternalDrilldown;
  const selectedMetrics = externalMetrics || internalMetrics;
  const setSelectedMetrics = onMetricsChange || setInternalMetrics;

  const toggleMetric = (key) => {
    if (selectedMetrics.includes(key)) {
      if (selectedMetrics.length > 1) {
        setSelectedMetrics(selectedMetrics.filter(m => m !== key));
      }
    } else {
      const defaultIdx = DEFAULT_FUNNEL_ORDER.indexOf(key);
      let insertIdx = selectedMetrics.length;
      for (let i = 0; i < selectedMetrics.length; i++) {
        if (DEFAULT_FUNNEL_ORDER.indexOf(selectedMetrics[i]) > defaultIdx) {
          insertIdx = i;
          break;
        }
      }
      const newMetrics = [...selectedMetrics];
      newMetrics.splice(insertIdx, 0, key);
      setSelectedMetrics(newMetrics);
    }
  };

  const resetOrder = () => setSelectedMetrics([...DEFAULT_FUNNEL_ORDER]);
  const selectAll = () => setSelectedMetrics([...DEFAULT_FUNNEL_ORDER]);
  const clearAll = () => setSelectedMetrics(['users']);

  const baseVal = data ? (data[selectedMetrics[0]] || 1) : 1;

  return (
    <div className="funnel-card">
      {title && data && <h3>{title}</h3>}

      {!hideControls && (
        <>
          <div className="funnel-toggle">
            <span className="toggle-label">% from Base</span>
            <div
              className={`toggle-switch ${drilldown ? 'active' : ''}`}
              onClick={() => setDrilldown(!drilldown)}
            />
            <span className="toggle-label">Stage-to-Stage</span>
          </div>

          <div className="metric-config">
            <div className="metric-config-title">
              <span>Funnel Metrics:</span>
              <button className="btn-xs" onClick={resetOrder}>Reset</button>
              <button className="btn-xs" onClick={selectAll}>All</button>
              <button className="btn-xs" onClick={clearAll}>Clear</button>
            </div>
            <div className="metric-chips">
              {ALL_METRICS.map(m => {
                const idx = selectedMetrics.indexOf(m.key);
                const isActive = idx > -1;
                return (
                  <span
                    key={m.key}
                    className={`metric-chip ${isActive ? 'active' : ''}`}
                    onClick={() => toggleMetric(m.key)}
                  >
                    {isActive && <span className="order">{idx + 1}</span>}
                    {m.label}
                  </span>
                );
              })}
            </div>
          </div>
        </>
      )}

      {data && (
        <div className="funnel-container">
          {selectedMetrics.map((key, idx) => {
            const metric = ALL_METRICS.find(m => m.key === key);
            if (!metric) return null;
            const val = data[key] || 0;
            const isBase = idx === 0;

            let pctLabel;
            if (drilldown && idx > 0) {
              const prevVal = data[selectedMetrics[idx - 1]] || 1;
              const pct = prevVal > 0 ? ((val / prevVal) * 100).toFixed(1) : '0.0';
              pctLabel = `${pct}% of prev`;
            } else {
              const pct = baseVal > 0 ? ((val / baseVal) * 100).toFixed(1) : '0.0';
              pctLabel = isBase ? 'BASE' : `${pct}%`;
            }

            const w = Math.max(80, 380 - idx * 25);

            return (
              <div key={key} className="funnel-step">
                <div
                  className={`funnel-bar ${isBase ? 'base' : ''}`}
                  style={{ width: `${w}px` }}
                >
                  <span>{metric.label}</span>
                  <span>{val.toLocaleString()} ({pctLabel})</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export { ALL_METRICS, DEFAULT_FUNNEL_ORDER };

export default ConversionFunnel;
