import { useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import StatsGrid from './StatsGrid';
import DataTable from './DataTable';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const SummaryTab = ({ data, view = 'daily' }) => {
  const [chartMetric, setChartMetric] = useState('users');

  if (!data) {
    return <div className="loading">Loading data...</div>;
  }

  // Get correct data based on view
  const recruiterData = view === 'daily' ? data.daily_by_recruiter : data.weekly_by_recruiter;
  const podData = view === 'daily' ? data.daily_by_pod : data.weekly_by_pod;

  const formatDuration = (secs) => {
    if (!secs) return '-';
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}m ${s}s`;
  };

  const recruiterColumns = [
    {
      key: 'recruiter',
      label: 'Recruiter',
      render: (v) => {
        if (!v || v === '(Not Assigned)') return <span style={{color: '#999'}}>Not Assigned</span>;
        return v.split('@')[0] || v;
      }
    },
    { key: 'users', label: 'Users' },
    { key: 'call_connected_users', label: 'Connected' },
    { key: 'call_gt_4min', label: '>4min' },
    { key: 'profiling_calling', label: 'Profiled' },
    { key: 'interest_shown', label: 'Interested' },
    {
      key: 'total_call_duration',
      label: 'Total Duration',
      render: (v) => formatDuration(v)
    },
    { key: 'profile_80plus', label: '80%+ Profile' }
  ];

  const podColumns = [
    {
      key: 'pod',
      label: 'Pod Manager',
      render: (v) => {
        if (!v || v === '(Not Assigned)') return <span style={{color: '#999'}}>Not Assigned</span>;
        return v.split('@')[0] || v;
      }
    },
    { key: 'users', label: 'Users' },
    { key: 'call_connected_users', label: 'Connected' },
    { key: 'call_gt_4min', label: '>4min' },
    { key: 'profiling_calling', label: 'Profiled' },
    { key: 'interest_shown', label: 'Interested' },
    {
      key: 'total_call_duration',
      label: 'Total Duration',
      render: (v) => formatDuration(v)
    },
    { key: 'profile_80plus', label: '80%+ Profile' }
  ];

  // Chart data - filter out unassigned
  const chartRecruiterData = (recruiterData || []).filter(r => r.recruiter && r.recruiter !== '(Not Assigned)');

  const chartData = {
    labels: chartRecruiterData.slice(0, 10).map(r => r.recruiter?.split('@')[0] || 'Unknown'),
    datasets: [{
      label: chartMetric === 'users' ? 'Total Users' :
             chartMetric === 'call_connected_users' ? 'Connected' :
             chartMetric === 'call_gt_4min' ? '>4min Calls' :
             chartMetric === 'profiling_calling' ? 'Profiled' : 'Interested',
      data: chartRecruiterData.slice(0, 10).map(r => r[chartMetric] || 0),
      backgroundColor: 'rgba(74, 144, 217, 0.7)',
      borderColor: 'rgba(74, 144, 217, 1)',
      borderWidth: 1
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: { beginAtZero: true }
    }
  };

  return (
    <div>
      <StatsGrid data={data.overall} />

      <div className="charts-row">
        <div className="chart-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4>Recruiter Performance</h4>
            <select
              value={chartMetric}
              onChange={(e) => setChartMetric(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '11px' }}
            >
              <option value="users">Total Users</option>
              <option value="call_connected_users">Connected</option>
              <option value="call_gt_4min">4min+</option>
              <option value="profiling_calling">Profiled</option>
              <option value="interest_shown">Interested</option>
            </select>
          </div>
          <div style={{ height: '300px' }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>
      </div>

      <DataTable
        title={`${view === 'daily' ? 'Daily' : 'Weekly'} Recruiter Breakdown`}
        data={recruiterData || []}
        columns={recruiterColumns}
        filterInput
      />

      <DataTable
        title={`${view === 'daily' ? 'Daily' : 'Weekly'} Pod Breakdown`}
        data={podData || []}
        columns={podColumns}
        filterInput
      />
    </div>
  );
};

export default SummaryTab;
