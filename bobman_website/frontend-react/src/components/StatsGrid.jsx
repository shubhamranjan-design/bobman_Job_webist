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
  { key: 'total_qualified_leads', label: 'Total Qualified' },
  { key: 'call_attempted', label: 'Calls' }
];

const StatsGrid = ({ data, viewMode = 'both', percentageBase = 'users' }) => {
  if (!data) return null;

  const baseVal = data[percentageBase] || 1;

  return (
    <div className="stats-grid">
      {ALL_METRICS.map((m) => {
        const val = data[m.key] || 0;
        const pct = baseVal > 0 ? ((val / baseVal) * 100).toFixed(1) : '0.0';
        const isBase = m.key === percentageBase;
        const showPct = viewMode !== 'numbers' && !isBase;

        // In percentage-only mode, show % as the main value (except for the base metric)
        const displayValue = (viewMode === 'percentage' && !isBase)
          ? `${pct}%`
          : val.toLocaleString();

        return (
          <div key={m.key} className="stat-card">
            <div className="value">{displayValue}</div>
            {showPct && viewMode !== 'percentage' && (
              <div className="pct">{pct}%</div>
            )}
            <div className="label">{m.label}</div>
          </div>
        );
      })}
    </div>
  );
};

export default StatsGrid;
