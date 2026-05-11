import { useState } from 'react';
import StatsGrid from './StatsGrid';
import ConversionFunnel from './ConversionFunnel';
import { MetricsBarChart } from './MetricsChart';
import DataTable from './DataTable';
import MultiSelect from './MultiSelect';

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
  { key: 'match_no_interest', label: 'Match No Int' },
  { key: 'interest_shown', label: 'Interested' },
  { key: 'total_qualified_leads', label: 'Qualified' },
  { key: 'call_attempted', label: 'Calls' }
];

const HOURLY_METRICS = [
  { key: 'users', label: 'Users' },
  { key: 'call_connected_users', label: 'Connected' },
  { key: 'profiling_calling', label: 'Prof(Call)' },
  { key: 'call_gt_4min', label: '>=4min' },
  { key: 'profile_80plus', label: '80%+' },
  { key: 'users_with_inbound', label: 'WA Inbound' },
  { key: 'profiling_linkedin_cv', label: 'Prof(LI/CV)' },
  { key: 'matching_job_found', label: 'Job Match' },
  { key: 'interest_shown', label: 'Interested' },
  { key: 'total_qualified_leads', label: 'Qualified' }
];

const OverviewTab = ({ data, viewMode = 'both', percentageBase = 'users' }) => {
  const [selectedDay, setSelectedDay] = useState(null);
  const [chartMetrics, setChartMetrics] = useState(['users', 'call_connected_users', 'call_gt_4min', 'interest_shown']);
  const [chartView, setChartView] = useState('overview'); // 'overview' or 'recruiter'
  const [hourlyMetrics, setHourlyMetrics] = useState([]);
  const [tatMetrics, setTatMetrics] = useState([]);
  const [dailyMetrics, setDailyMetrics] = useState([]);
  const [hourlySortCol, setHourlySortCol] = useState('hour');
  const [hourlySortDir, setHourlySortDir] = useState('asc');
  const [tatSortCol, setTatSortCol] = useState('users');
  const [tatSortDir, setTatSortDir] = useState('desc');

  if (!data) {
    return <div className="loading">Loading data...</div>;
  }

  const formatDuration = (secs) => {
    if (!secs || secs === 0) return '0s';
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (hours > 0) return `${hours}h${mins}m`;
    if (mins > 0) return `${mins}m${s}s`;
    return `${s}s`;
  };

  const formatHourLabel = (h) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}${ampm}`;
  };

  // Daily breakdown data - use 'daily' key from API
  const dailyData = data.daily || data.daily_breakdown || [];

  // Recruiter chart data - aggregate recruiters
  const recruiterData = (data.recruiters || data.daily_by_recruiter || [])
    .filter(r => (r.name || r.recruiter) && (r.name || r.recruiter) !== '(Not Assigned)')
    .slice(0, 10);

  const DAILY_METRICS = [
    { key: 'users', label: 'Users' },
    { key: 'call_connected_users', label: 'Connected' },
    { key: 'profiling_calling', label: 'Profiled' },
    { key: 'call_gt_4min', label: '>=4min' },
    { key: 'profile_80plus', label: '80%+' },
    { key: 'users_with_inbound', label: 'WA Inbound' },
    { key: 'profiling_linkedin_cv', label: 'Prof(LI/CV)' },
    { key: 'matching_job_found', label: 'Job Match' },
    { key: 'interest_shown', label: 'Interested' },
    { key: 'total_qualified_leads', label: 'Qualified' },
    { key: 'total_call_duration', label: 'Duration' }
  ];

  const effectiveDailyMetrics = dailyMetrics.length === 0
    ? DAILY_METRICS.map(m => m.key)
    : dailyMetrics.filter(v => v !== '__NONE__');

  const dailyColumns = [
    { key: 'date', label: 'Date' },
    ...effectiveDailyMetrics.map(key => {
      const m = DAILY_METRICS.find(dm => dm.key === key);
      if (!m) return null;
      return {
        key: m.key,
        label: m.label,
        metric: key !== 'total_call_duration',
        render: key === 'total_call_duration' ? formatDuration : undefined
      };
    }).filter(Boolean)
  ];

  // Duration breakdown buckets
  const durationBuckets = [
    { suffix: 'no_answer', label: 'No Answer' },
    { suffix: 'lt_1min', label: '< 1 min' },
    { suffix: '1_2min', label: '1-2 mins' },
    { suffix: '2_4min', label: '2-4 mins' },
    { suffix: '4_10min', label: '4-10 mins' },
    { suffix: 'gte_10min', label: '>= 10 mins' }
  ];

  // Hourly breakdown
  const hourlyData = data.hourly || data.hourly_breakdown || [];

  // TAT data
  const tatData = data.tat || [];
  const tatMilestones = data.tat_milestones || {};

  // TAT key mapping
  const tatKeyMap = {
    'users': 'users',
    'call_connected_users': 'connected',
    'call_gt_4min': 'gte_4min',
    'profile_80plus': 'profile_80plus',
    'profiling_linkedin_cv': 'has_cv',
    'matching_job_found': 'matched',
    'interest_shown': 'interested'
  };

  // Sort hourly data
  const sortedHourlyData = [...hourlyData].sort((a, b) => {
    let av = hourlySortCol === 'hour' ? a.hour : (a[hourlySortCol] || 0);
    let bv = hourlySortCol === 'hour' ? b.hour : (b[hourlySortCol] || 0);
    return hourlySortDir === 'asc' ? av - bv : bv - av;
  });

  // Sort TAT data
  const tatBucketOrder = ["lt_1hr", "1_3hr", "3_6hr", "6_12hr", "12_24hr", "gt_24hr", "no_call"];
  const sortedTatData = [...tatData].sort((a, b) => {
    if (tatSortCol === 'bucket') {
      const ai = tatBucketOrder.indexOf(a.bucket);
      const bi = tatBucketOrder.indexOf(b.bucket);
      return tatSortDir === 'asc' ? ai - bi : bi - ai;
    }
    const tatKey = tatKeyMap[tatSortCol] || tatSortCol;
    const av = a[tatKey] || 0;
    const bv = b[tatKey] || 0;
    return tatSortDir === 'asc' ? av - bv : bv - av;
  });

  const handleHourlySort = (col) => {
    if (hourlySortCol === col) {
      setHourlySortDir(hourlySortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setHourlySortCol(col);
      setHourlySortDir(col === 'hour' ? 'asc' : 'desc');
    }
  };

  const handleTatSort = (col) => {
    if (tatSortCol === col) {
      setTatSortDir(tatSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setTatSortCol(col);
      setTatSortDir(col === 'bucket' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (col, sortCol, sortDir) => {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  // Calculate duration totals with WA metrics
  const o = data.overall || {};
  const durationTotals = { u: 0, c: 0, wf: 0, wrt: 0, wri: 0, wrc: 0, wrm: 0, wrint: 0, wct: 0, wci: 0, wcc: 0, wcm: 0, wcint: 0 };

  durationBuckets.forEach(b => {
    const s = b.suffix;
    durationTotals.u += o[`dur_${s}`] || 0;
    durationTotals.c += o[`calls_${s}`] || 0;
    durationTotals.wf += o[`wa_fail_${s}`] || 0;
    durationTotals.wrt += o[`wa_reconn_${s}`] || 0;
    durationTotals.wri += o[`wa_reconn_inb_${s}`] || 0;
    durationTotals.wrc += o[`wa_reconn_cv_${s}`] || 0;
    durationTotals.wrm += o[`wa_reconn_mat_${s}`] || 0;
    durationTotals.wrint += o[`wa_reconn_int_${s}`] || 0;
    durationTotals.wct += o[`wa_conn_${s}`] || 0;
    durationTotals.wci += o[`wa_conn_inb_${s}`] || 0;
    durationTotals.wcc += o[`wa_conn_cv_${s}`] || 0;
    durationTotals.wcm += o[`wa_conn_mat_${s}`] || 0;
    durationTotals.wcint += o[`wa_conn_int_${s}`] || 0;
  });

  // Render TAT milestone table
  const renderMilestoneTable = (milestoneData, title) => {
    if (!milestoneData || milestoneData.length === 0) return null;

    const totalUsers = o.users || 1;
    let totalReached = 0;
    milestoneData.forEach(d => {
      if (d.bucket !== 'not_reached') totalReached += d.count;
    });

    return (
      <div className="table-wrapper">
        <div className="table-header">
          <span>{title}</span>
        </div>
        <table className="data-table compact">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Time Bucket</th>
              <th>Count</th>
              <th>% Users</th>
              <th>% Reached</th>
            </tr>
          </thead>
          <tbody>
            {milestoneData.map((d, idx) => {
              const pctUsers = totalUsers > 0 ? (d.count / totalUsers * 100).toFixed(1) : 0;
              const pctReached = d.bucket !== 'not_reached' && totalReached > 0 ? (d.count / totalReached * 100).toFixed(1) : '-';
              const bgColor = d.bucket === 'not_reached' ? '#fff3f3' : (d.bucket === 'lt_1hr' ? '#e8f5e9' : '');
              return (
                <tr key={idx} style={{ background: bgColor }}>
                  <td style={{ fontWeight: 600 }}>{d.label}</td>
                  <td style={{ fontWeight: 600 }}>{d.count.toLocaleString()}</td>
                  <td>{pctUsers}%</td>
                  <td>{pctReached}{pctReached !== '-' ? '%' : ''}</td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td>Total Reached</td>
              <td style={{ fontWeight: 700 }}>{totalReached.toLocaleString()}</td>
              <td>{(totalReached / totalUsers * 100).toFixed(1)}%</td>
              <td>100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="overview-tab">
      {/* Stats Grid */}
      <StatsGrid data={data.overall} viewMode={viewMode} percentageBase={percentageBase} />

      {/* Charts Row */}
      <div className="charts-grid">
        {/* Conversion Funnel */}
        <div className="chart-card">
          <ConversionFunnel data={data.overall} />
        </div>

        {/* Metrics Overview / Recruiter Performance Toggle */}
        <div className="chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>{chartView === 'overview' ? 'Metrics Overview' : 'Recruiter Performance'}</h3>
            <div className="view-toggle">
              <button
                className={`view-toggle-btn ${chartView === 'overview' ? 'active' : ''}`}
                onClick={() => setChartView('overview')}
              >
                Metrics
              </button>
              <button
                className={`view-toggle-btn ${chartView === 'recruiter' ? 'active' : ''}`}
                onClick={() => setChartView('recruiter')}
              >
                Recruiters
              </button>
            </div>
          </div>
          {chartView === 'overview' ? (
            <MetricsBarChart
              data={[data.overall]}
              labels={['']}
              metrics={ALL_METRICS}
              singleGroup
            />
          ) : (
            <>
              <div className="chart-metric-selector">
                <select
                  value={chartMetrics[0]}
                  onChange={(e) => setChartMetrics([e.target.value])}
                >
                  {ALL_METRICS.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>
              <MetricsBarChart
                data={recruiterData}
                labels={recruiterData.map(r => (r.name || r.recruiter)?.split('@')[0] || 'Unknown')}
                metrics={[ALL_METRICS.find(m => m.key === chartMetrics[0]) || ALL_METRICS[0]]}
                showValues
              />
            </>
          )}
        </div>
      </div>

      {/* Daily Breakdown */}
      <h2>Daily Breakdown</h2>
      <div className="table-controls">
        <span style={{ fontWeight: 600 }}>Daily Data</span>
        <div className="filter-group" style={{ marginLeft: 'auto' }}>
          <label>Metrics:</label>
          <MultiSelect
            options={DAILY_METRICS.map(m => m.key)}
            selected={dailyMetrics}
            onChange={setDailyMetrics}
            placeholder="Select Metrics"
            renderOption={(opt) => DAILY_METRICS.find(m => m.key === opt)?.label || opt}
          />
        </div>
      </div>
      <DataTable
        data={dailyData}
        columns={dailyColumns}
        onRowClick={(row) => setSelectedDay(row)}
        sortable
        viewMode={viewMode}
        percentageBase={percentageBase}
      />

      {/* Selected Day Funnel */}
      {selectedDay && (
        <div className="selected-item-funnel">
          <ConversionFunnel data={selectedDay} title={`Funnel for: ${selectedDay.date}`} />
        </div>
      )}

      {/* Duration & Call Analysis */}
      <h2>Duration & Call Analysis</h2>
      <div className="analysis-grid">
        {/* Duration Averages */}
        <div className="table-wrapper">
          <div className="table-header">
            <span>Duration Averages</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Metric</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total Call Duration</td>
                <td style={{ fontWeight: 600 }}>{formatDuration(o.total_call_duration)}</td>
              </tr>
              <tr>
                <td>Avg Duration/Connected User</td>
                <td style={{ fontWeight: 600 }}>{formatDuration(Math.round((o.total_call_duration || 0) / (o.call_connected_users || 1)))}</td>
              </tr>
              <tr>
                <td>Avg Duration/User</td>
                <td style={{ fontWeight: 600 }}>{formatDuration(Math.round((o.total_call_duration || 0) / (o.users || 1)))}</td>
              </tr>
              <tr>
                <td>Connected Users</td>
                <td>{(o.call_connected_users || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td>Total Users</td>
                <td>{(o.users || 0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Call Duration Breakdown with WA Metrics */}
        <div className="table-wrapper">
          <div className="table-header">
            <span>Call Duration Breakdown</span>
          </div>
          <div className="table-scroll">
            <table className="data-table compact wa-table">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ textAlign: 'left' }}>Duration</th>
                  <th rowSpan={2}>Users</th>
                  <th rowSpan={2}>Calls</th>
                  <th rowSpan={2} className="wa-fail-header">WA Fail</th>
                  <th colSpan={5} className="wa-reconn-header">WA Reconnected</th>
                  <th colSpan={5} className="wa-conn-header">WA Connected</th>
                </tr>
                <tr>
                  <th className="wa-reconn-header sub">Tot</th>
                  <th className="wa-reconn-header sub">Inb</th>
                  <th className="wa-reconn-header sub">CV</th>
                  <th className="wa-reconn-header sub">Mat</th>
                  <th className="wa-reconn-header sub">Int</th>
                  <th className="wa-conn-header sub">Tot</th>
                  <th className="wa-conn-header sub">Inb</th>
                  <th className="wa-conn-header sub">CV</th>
                  <th className="wa-conn-header sub">Mat</th>
                  <th className="wa-conn-header sub">Int</th>
                </tr>
              </thead>
              <tbody>
                {durationBuckets.map((b, idx) => {
                  const s = b.suffix;
                  return (
                    <tr key={idx}>
                      <td>{b.label}</td>
                      <td>{(o[`dur_${s}`] || 0).toLocaleString()}</td>
                      <td>{(o[`calls_${s}`] || 0).toLocaleString()}</td>
                      <td className="wa-fail">{o[`wa_fail_${s}`] || 0}</td>
                      <td className="wa-reconn">{o[`wa_reconn_${s}`] || 0}</td>
                      <td className="wa-reconn">{o[`wa_reconn_inb_${s}`] || 0}</td>
                      <td className="wa-reconn">{o[`wa_reconn_cv_${s}`] || 0}</td>
                      <td className="wa-reconn">{o[`wa_reconn_mat_${s}`] || 0}</td>
                      <td className="wa-reconn">{o[`wa_reconn_int_${s}`] || 0}</td>
                      <td className="wa-conn">{o[`wa_conn_${s}`] || 0}</td>
                      <td className="wa-conn">{o[`wa_conn_inb_${s}`] || 0}</td>
                      <td className="wa-conn">{o[`wa_conn_cv_${s}`] || 0}</td>
                      <td className="wa-conn">{o[`wa_conn_mat_${s}`] || 0}</td>
                      <td className="wa-conn">{o[`wa_conn_int_${s}`] || 0}</td>
                    </tr>
                  );
                })}
                <tr className="total-row">
                  <td><strong>Total</strong></td>
                  <td><strong>{durationTotals.u.toLocaleString()}</strong></td>
                  <td><strong>{durationTotals.c.toLocaleString()}</strong></td>
                  <td className="wa-fail" style={{ fontWeight: 700 }}>{durationTotals.wf}</td>
                  <td className="wa-reconn" style={{ fontWeight: 700 }}>{durationTotals.wrt}</td>
                  <td className="wa-reconn" style={{ fontWeight: 700 }}>{durationTotals.wri}</td>
                  <td className="wa-reconn" style={{ fontWeight: 700 }}>{durationTotals.wrc}</td>
                  <td className="wa-reconn" style={{ fontWeight: 700 }}>{durationTotals.wrm}</td>
                  <td className="wa-reconn" style={{ fontWeight: 700 }}>{durationTotals.wrint}</td>
                  <td className="wa-conn" style={{ fontWeight: 700 }}>{durationTotals.wct}</td>
                  <td className="wa-conn" style={{ fontWeight: 700 }}>{durationTotals.wci}</td>
                  <td className="wa-conn" style={{ fontWeight: 700 }}>{durationTotals.wcc}</td>
                  <td className="wa-conn" style={{ fontWeight: 700 }}>{durationTotals.wcm}</td>
                  <td className="wa-conn" style={{ fontWeight: 700 }}>{durationTotals.wcint}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Time Period Analysis */}
      <h2>Time Period Analysis</h2>
      <div className="analysis-grid">
        {/* Hourly Funnel */}
        <div className="table-wrapper">
          <div className="table-controls">
            <span style={{ fontWeight: 600 }}>Hourly Funnel (First Call Time - IST)</span>
            <div className="filter-group" style={{ marginLeft: 'auto' }}>
              <label>Metrics:</label>
              <MultiSelect
                options={HOURLY_METRICS.map(m => m.key)}
                selected={hourlyMetrics}
                onChange={setHourlyMetrics}
                placeholder="Metrics"
                renderOption={(opt) => HOURLY_METRICS.find(m => m.key === opt)?.label || opt}
              />
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th
                    style={{ textAlign: 'left', cursor: 'pointer' }}
                    onClick={() => handleHourlySort('hour')}
                  >
                    Hour{sortIcon('hour', hourlySortCol, hourlySortDir)}
                  </th>
                  {HOURLY_METRICS.filter(m => hourlyMetrics.length === 0 || hourlyMetrics.includes(m.key)).map(m => (
                    <th
                      key={m.key}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleHourlySort(m.key)}
                    >
                      {m.label}{sortIcon(m.key, hourlySortCol, hourlySortDir)}
                    </th>
                  ))}
                  <th>Int%</th>
                </tr>
              </thead>
              <tbody>
                {sortedHourlyData.map((h, idx) => {
                  const users = h.users || 1;
                  const intPct = ((h.interest_shown || 0) / users * 100).toFixed(1);
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{formatHourLabel(h.hour)}</td>
                      {HOURLY_METRICS.filter(m => hourlyMetrics.length === 0 || hourlyMetrics.includes(m.key)).map(m => {
                        const v = h[m.key] || 0;
                        const pct = m.key !== 'users' ? ` (${(v / users * 100).toFixed(0)}%)` : '';
                        return <td key={m.key}>{v}<span className="pct-val">{pct}</span></td>;
                      })}
                      <td style={{ fontWeight: 600, color: '#9b59b6' }}>{intPct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* TAT (User Creation → First Call) */}
        {tatData.length > 0 && (
          <div className="table-wrapper">
            <div className="table-controls">
              <span style={{ fontWeight: 600 }}>TAT (User Creation → First Call)</span>
              <div className="filter-group" style={{ marginLeft: 'auto' }}>
                <label>Metrics:</label>
                <MultiSelect
                  options={HOURLY_METRICS.map(m => m.key)}
                  selected={tatMetrics}
                  onChange={setTatMetrics}
                  placeholder="Metrics"
                  renderOption={(opt) => HOURLY_METRICS.find(m => m.key === opt)?.label || opt}
                />
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th
                      style={{ textAlign: 'left', cursor: 'pointer' }}
                      onClick={() => handleTatSort('bucket')}
                    >
                      TAT{sortIcon('bucket', tatSortCol, tatSortDir)}
                    </th>
                    {HOURLY_METRICS.filter(m => tatMetrics.length === 0 || tatMetrics.includes(m.key)).map(m => (
                      <th
                        key={m.key}
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleTatSort(m.key)}
                      >
                        {m.label}{sortIcon(m.key, tatSortCol, tatSortDir)}
                      </th>
                    ))}
                    <th>Int%</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTatData.map((t, idx) => {
                    const users = t.users || 1;
                    const intPct = ((t.interested || 0) / users * 100).toFixed(1);
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{t.label}</td>
                        {HOURLY_METRICS.filter(m => tatMetrics.length === 0 || tatMetrics.includes(m.key)).map(m => {
                          const tatKey = tatKeyMap[m.key] || m.key;
                          const v = t[tatKey] || 0;
                          const pct = m.key !== 'users' ? ` (${(v / users * 100).toFixed(0)}%)` : '';
                          return <td key={m.key}>{v}<span className="pct-val">{pct}</span></td>;
                        })}
                        <td style={{ fontWeight: 600, color: '#9b59b6' }}>{intPct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* TAT Milestones */}
      {tatMilestones && (tatMilestones.to_cv || tatMilestones.to_match || tatMilestones.to_interest) && (
        <>
          <h2>TAT Milestones (First Call → Milestone)</h2>
          <div className="milestone-grid">
            {renderMilestoneTable(tatMilestones.to_cv, 'First Call → CV Generated')}
            {renderMilestoneTable(tatMilestones.to_match, 'First Call → Matching Started')}
            {renderMilestoneTable(tatMilestones.to_interest, 'First Call → Interest Shown')}
          </div>
        </>
      )}
    </div>
  );
};

export default OverviewTab;
