import { useState } from 'react';
import DataTable from './DataTable';
import MultiSelect from './MultiSelect';
import ConversionFunnel from './ConversionFunnel';

const ALL_METRICS = [
  { key: 'users', label: 'Users' },
  { key: 'call_connected_users', label: 'Connected' },
  { key: 'profiling_calling', label: 'Prof(Call)' },
  { key: 'call_gt_4min', label: '>=4min' },
  { key: 'profile_80plus', label: '80%+' },
  { key: 'users_with_inbound', label: 'WA Inbound' },
  { key: 'profiling_linkedin_cv', label: 'Prof(LI/CV)' },
  { key: 'matching_job_found', label: 'Job Match' },
  { key: 'interest_shown', label: 'Interested' },
  { key: 'total_qualified_leads', label: 'Qualified' },
  { key: 'total_call_duration', label: 'Duration' }
];

const formatDuration = (secs) => {
  if (!secs) return '-';
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

const PodsTab = ({ data, viewMode = 'both', percentageBase = 'users' }) => {
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [selectedPod, setSelectedPod] = useState(null);

  if (!data) {
    return <div className="loading">Loading data...</div>;
  }

  const podData = data.daily_by_pod || [];

  // Aggregate by pod
  const aggregatedData = {};
  podData.forEach(row => {
    const key = row.pod || '(Not Assigned)';
    if (!aggregatedData[key]) {
      aggregatedData[key] = { pod: key };
      ALL_METRICS.forEach(m => {
        aggregatedData[key][m.key] = 0;
      });
    }
    ALL_METRICS.forEach(m => {
      aggregatedData[key][m.key] += row[m.key] || 0;
    });
  });

  const tableData = Object.values(aggregatedData).sort((a, b) => (b.users || 0) - (a.users || 0));

  // Empty array = All selected (MultiSelect convention)
  const effectiveMetrics = selectedMetrics.length === 0
    ? ALL_METRICS.map(m => m.key)
    : selectedMetrics.filter(v => v !== '__NONE__');

  const columns = [
    {
      key: 'pod',
      label: 'Pod (Team Manager)',
      render: (v) => {
        if (!v || v === '(Not Assigned)') return <span style={{ color: '#999' }}>Not Assigned</span>;
        return v.split('@')[0] || v;
      }
    },
    ...effectiveMetrics.map(key => {
      const metric = ALL_METRICS.find(m => m.key === key);
      return {
        key: metric.key,
        label: metric.label,
        metric: key !== 'total_call_duration',
        render: key === 'total_call_duration' ? formatDuration : undefined
      };
    })
  ];

  // Calculate totals
  const totals = { pod: 'TOTAL' };
  ALL_METRICS.forEach(m => {
    totals[m.key] = tableData.reduce((sum, row) => sum + (row[m.key] || 0), 0);
  });

  return (
    <div className="pods-tab">
      <h2>Pod Performance</h2>

      {/* Filters */}
      <div className="table-controls">
        <span style={{ fontWeight: 600 }}>All Pods</span>
        <div className="filter-group" style={{ marginLeft: 'auto' }}>
          <label>Metrics:</label>
          <MultiSelect
            options={ALL_METRICS.map(m => m.key)}
            selected={selectedMetrics}
            onChange={setSelectedMetrics}
            placeholder="Select Metrics"
            renderOption={(opt) => ALL_METRICS.find(m => m.key === opt)?.label || opt}
          />
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        data={tableData}
        columns={columns}
        sortable
        onRowClick={(row) => setSelectedPod(row)}
        totals={totals}
        viewMode={viewMode}
        percentageBase={percentageBase}
      />

      {/* Selected Pod Funnel */}
      {selectedPod && (
        <div className="selected-item-funnel">
          <ConversionFunnel data={selectedPod} title={`Funnel for: ${selectedPod.pod?.split('@')[0] || 'Selected Pod'}`} />
        </div>
      )}
    </div>
  );
};

export default PodsTab;
