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

const CohortTab = ({ data, viewMode = 'both', percentageBase = 'users' }) => {
  const [view, setView] = useState('daily');
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [recruiterFilter, setRecruiterFilter] = useState([]);
  const [podFilter, setPodFilter] = useState([]);

  if (!data) {
    return <div className="loading">Loading data...</div>;
  }

  const views = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'daily-recruiter', label: 'Daily by Recruiter' },
    { id: 'daily-pod', label: 'Daily by Pod' },
    { id: 'weekly-recruiter', label: 'Weekly by Recruiter' },
    { id: 'weekly-pod', label: 'Weekly by Pod' }
  ];

  // Empty array = All selected (MultiSelect convention)
  const effectiveMetrics = selectedMetrics.length === 0
    ? ALL_METRICS.map(m => m.key)
    : selectedMetrics.filter(v => v !== '__NONE__');

  const getColumns = (nameKey, nameLabel) => {
    const cols = [{ key: nameKey, label: nameLabel }];
    effectiveMetrics.forEach(key => {
      const metric = ALL_METRICS.find(m => m.key === key);
      if (metric) {
        cols.push({
          key: metric.key,
          label: metric.label,
          metric: key !== 'total_call_duration',
          render: key === 'total_call_duration' ? formatDuration : undefined
        });
      }
    });
    return cols;
  };

  const getViewData = () => {
    switch (view) {
      case 'daily':
        return {
          data: data.daily || data.daily_breakdown || [],
          columns: getColumns('date', 'Date'),
          nameKey: 'date'
        };
      case 'weekly':
        return {
          data: data.weekly || data.weekly_breakdown || [],
          columns: getColumns('week', 'Week'),
          nameKey: 'week'
        };
      case 'daily-recruiter':
        let dailyRecData = data.daily_by_recruiter || [];
        if (recruiterFilter.length > 0) {
          dailyRecData = dailyRecData.filter(r => recruiterFilter.includes(r.recruiter));
        }
        return {
          data: dailyRecData,
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'recruiter', label: 'Recruiter', render: v => v?.split('@')[0] || v },
            ...getColumns('', '').slice(1)
          ],
          nameKey: 'recruiter'
        };
      case 'daily-pod':
        let dailyPodData = data.daily_by_pod || [];
        if (podFilter.length > 0) {
          dailyPodData = dailyPodData.filter(p => podFilter.includes(p.pod));
        }
        return {
          data: dailyPodData,
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'pod', label: 'Pod', render: v => v?.split('@')[0] || v },
            ...getColumns('', '').slice(1)
          ],
          nameKey: 'pod'
        };
      case 'weekly-recruiter':
        let weeklyRecData = data.weekly_by_recruiter || [];
        if (recruiterFilter.length > 0) {
          weeklyRecData = weeklyRecData.filter(r => recruiterFilter.includes(r.recruiter));
        }
        return {
          data: weeklyRecData,
          columns: [
            { key: 'week', label: 'Week' },
            { key: 'recruiter', label: 'Recruiter', render: v => v?.split('@')[0] || v },
            ...getColumns('', '').slice(1)
          ],
          nameKey: 'recruiter'
        };
      case 'weekly-pod':
        let weeklyPodData = data.weekly_by_pod || [];
        if (podFilter.length > 0) {
          weeklyPodData = weeklyPodData.filter(p => podFilter.includes(p.pod));
        }
        return {
          data: weeklyPodData,
          columns: [
            { key: 'week', label: 'Week' },
            { key: 'pod', label: 'Pod', render: v => v?.split('@')[0] || v },
            ...getColumns('', '').slice(1)
          ],
          nameKey: 'pod'
        };
      default:
        return { data: [], columns: [], nameKey: '' };
    }
  };

  const { data: viewData, columns, nameKey } = getViewData();

  // Get unique recruiters and pods for filters
  const allRecruiters = [...new Set((data.daily_by_recruiter || []).map(r => r.recruiter).filter(Boolean))];
  const allPods = [...new Set((data.daily_by_pod || []).map(p => p.pod).filter(Boolean))];

  // Calculate totals
  const totals = {};
  if (viewData.length > 0) {
    // Set name column
    const firstCol = columns[0]?.key;
    if (firstCol) totals[firstCol] = 'TOTAL';
    // For multi-key views, set second key too
    if (columns.length > 1 && !columns[1].metric) {
      totals[columns[1].key] = '';
    }
    ALL_METRICS.forEach(m => {
      if (m.key === 'total_call_duration') {
        totals[m.key] = viewData.reduce((sum, row) => sum + (row[m.key] || 0), 0);
      } else {
        totals[m.key] = viewData.reduce((sum, row) => sum + (row[m.key] || 0), 0);
      }
    });
  }

  return (
    <div className="cohort-tab">
      <h2>Cohort Analysis</h2>

      {/* View Selector */}
      <div className="subtabs">
        {views.map(v => (
          <button
            key={v.id}
            className={`btn btn-secondary btn-sm ${view === v.id ? 'active' : ''}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="table-controls">
        {(view.includes('recruiter')) && (
          <div className="filter-group">
            <label>Recruiters:</label>
            <MultiSelect
              options={allRecruiters}
              selected={recruiterFilter}
              onChange={setRecruiterFilter}
              placeholder="All Recruiters"
            />
          </div>
        )}
        {(view.includes('pod')) && (
          <div className="filter-group">
            <label>Pods:</label>
            <MultiSelect
              options={allPods}
              selected={podFilter}
              onChange={setPodFilter}
              placeholder="All Pods"
            />
          </div>
        )}
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
        data={viewData}
        columns={columns}
        sortable
        onRowClick={(row) => setSelectedItem(row)}
        totals={viewData.length > 0 ? totals : null}
        viewMode={viewMode}
        percentageBase={percentageBase}
      />

      {/* Selected Item Funnel */}
      {selectedItem && (
        <div className="selected-item-funnel">
          <ConversionFunnel data={selectedItem} title={`Funnel for: ${selectedItem[nameKey] || 'Selected'}`} />
        </div>
      )}
    </div>
  );
};

export default CohortTab;
