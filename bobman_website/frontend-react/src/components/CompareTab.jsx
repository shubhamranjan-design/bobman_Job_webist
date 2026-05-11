import React, { useState } from 'react';
import ConversionFunnel, { DEFAULT_FUNNEL_ORDER } from './ConversionFunnel';
import { ComparisonChart } from './MetricsChart';
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

const DURATION_BUCKETS = [
  { suffix: 'no_answer', label: 'No Answer' },
  { suffix: 'lt_1min', label: '< 1 min' },
  { suffix: '1_2min', label: '1-2 mins' },
  { suffix: '2_4min', label: '2-4 mins' },
  { suffix: '4_10min', label: '4-10 mins' },
  { suffix: 'gte_10min', label: '>= 10 mins' }
];

const TAT_BUCKET_ORDER = ['lt_1hr', '1_3hr', '3_6hr', '6_12hr', '12_24hr', 'gt_24hr', 'no_call'];
const TAT_BUCKET_LABELS = {
  'lt_1hr': '< 1 hour', '1_3hr': '1-3 hours', '3_6hr': '3-6 hours',
  '6_12hr': '6-12 hours', '12_24hr': '12-24 hours', 'gt_24hr': '> 24 hours', 'no_call': 'No Call'
};

const MILESTONE_BUCKET_ORDER = ['lt_1hr', '1_3hr', '3_6hr', '6_12hr', '12_24hr', 'gt_24hr', 'not_reached'];

const CompareTab = ({ data, onCompare }) => {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

  const [period1Start, setPeriod1Start] = useState(weekAgo);
  const [period1End, setPeriod1End] = useState(today);
  const [period2Start, setPeriod2Start] = useState(twoWeeksAgo);
  const [period2End, setPeriod2End] = useState(weekAgo);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('overall');
  const [displayMode, setDisplayMode] = useState('both');
  const [diffBy, setDiffBy] = useState('number');
  const [diffDirection, setDiffDirection] = useState('p1-p2');
  const [selectedMetrics, setSelectedMetrics] = useState([]);

  // Shared funnel state for compare funnels
  const [cmpFunnelMetrics, setCmpFunnelMetrics] = useState([...DEFAULT_FUNNEL_ORDER]);
  const [cmpFunnelDrilldown, setCmpFunnelDrilldown] = useState(false);

  // Hourly view state
  const [heatmapTimestamp, setHeatmapTimestamp] = useState('attempted');
  const [heatmapMetric, setHeatmapMetric] = useState('call_gt_4min');
  const [hourlyTableMetrics, setHourlyTableMetrics] = useState([]);
  const [tatMetrics, setTatMetrics] = useState([]);
  const [tatSortCol, setTatSortCol] = useState('bucket');
  const [tatSortDir, setTatSortDir] = useState('asc');

  // Normalize: API returns { period1: { label, data: {...} }, period2: { label, data: {...} } }
  const p1 = data?.period1?.data || data?.period1 || {};
  const p2 = data?.period2?.data || data?.period2 || {};
  const p1Label = data?.period1?.label || `${period1Start} to ${period1End}`;
  const p2Label = data?.period2?.label || `${period2Start} to ${period2End}`;

  // Effective metrics ([] = all via MultiSelect convention)
  const effectiveMetrics = selectedMetrics.length === 0
    ? ALL_METRICS.map(m => m.key)
    : selectedMetrics.filter(v => v !== '__NONE__');

  const effectiveHourlyMetrics = hourlyTableMetrics.length === 0
    ? HOURLY_METRICS.map(m => m.key)
    : hourlyTableMetrics.filter(v => v !== '__NONE__');

  const effectiveTatMetrics = tatMetrics.length === 0
    ? HOURLY_METRICS.slice(0, 7).map(m => m.key)
    : tatMetrics.filter(v => v !== '__NONE__');

  const handleCompare = async () => {
    if (!period1Start || !period1End || !period2Start || !period2End) {
      alert('Please select both date ranges');
      return;
    }
    setLoading(true);
    await onCompare(period1Start, period1End, period2Start, period2End);
    setLoading(false);
  };

  const formatDuration = (secs) => {
    if (!secs || isNaN(secs)) return '-';
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${seconds}s`;
    return `${seconds}s`;
  };

  const formatHour = (h) => {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${hour12}${suffix}`;
  };

  // Format for OVERALL comparison table (matches HTML renderOverallComparisonTable)
  // percentage/both: number (pct%), drilldown: number (drillPct%↓)
  const formatValueOverall = (val, baseVal, prevVal) => {
    const v = val || 0;
    const pct = baseVal > 0 ? ((v / baseVal) * 100).toFixed(1) : '0.0';
    const drillPct = prevVal > 0 ? ((v / prevVal) * 100).toFixed(1) : '0.0';
    if (displayMode === 'numbers') return v.toLocaleString();
    if (displayMode === 'drilldown') {
      return <>{v.toLocaleString()} <span className="drill-pct">({drillPct}%&darr;)</span></>;
    }
    // 'percentage' and 'both' both show number (pct%)
    return <>{v.toLocaleString()} <span className="pct-val">({pct}%)</span></>;
  };

  // Format for ENTITY comparison tables (pods, recruiters, daily)
  // percentage: just pct%, both: number + pct% on two lines
  const formatValue = (val, baseVal, prevVal) => {
    const v = val || 0;
    const pct = baseVal > 0 ? ((v / baseVal) * 100).toFixed(1) : '0.0';
    const drillPct = prevVal > 0 ? ((v / prevVal) * 100).toFixed(1) : '0.0';
    if (displayMode === 'numbers') return v.toLocaleString();
    if (displayMode === 'percentage') return <>{pct}%</>;
    if (displayMode === 'drilldown') return <>{drillPct}%</>;
    // 'both' - number on first line, percentage on second
    return <><span style={{ fontSize: '10px' }}>{v.toLocaleString()}</span><br /><span className="pct-val">{pct}%</span></>;
  };

  const formatDiff = (val1, val2, base1, base2, prev1, prev2) => {
    const isP1MinusP2 = diffDirection === 'p1-p2';
    if (diffBy === 'percentage') {
      let diffNum;
      if (displayMode === 'drilldown') {
        const dp1 = prev1 > 0 ? (val1 / prev1 * 100) : 0;
        const dp2 = prev2 > 0 ? (val2 / prev2 * 100) : 0;
        diffNum = isP1MinusP2 ? (dp1 - dp2) : (dp2 - dp1);
      } else {
        const pct1 = base1 > 0 ? (val1 / base1 * 100) : 0;
        const pct2 = base2 > 0 ? (val2 / base2 * 100) : 0;
        diffNum = isP1MinusP2 ? (pct1 - pct2) : (pct2 - pct1);
      }
      return (
        <span className={diffNum >= 0 ? 'positive-text' : 'negative-text'} style={{ fontWeight: 600 }}>
          {diffNum >= 0 ? '+' : ''}{diffNum.toFixed(1)}pp
        </span>
      );
    }
    const diffNum = isP1MinusP2 ? (val1 - val2) : (val2 - val1);
    return (
      <span className={diffNum >= 0 ? 'positive-text' : 'negative-text'} style={{ fontWeight: 600 }}>
        {diffNum >= 0 ? '+' : ''}{diffNum.toLocaleString()}
      </span>
    );
  };

  const views = [
    { id: 'overall', label: 'Overall' },
    { id: 'pods', label: 'By Pod' },
    { id: 'recruiters', label: 'By Recruiter' },
    { id: 'daily', label: 'Daily' },
    { id: 'hourly', label: 'Hourly' }
  ];

  // ===== OVERALL VIEW =====
  const renderOverallComparison = () => {
    if (!data) return null;
    const o1 = p1.overall || {};
    const o2 = p2.overall || {};

    return (
      <div>
        {/* Shared Funnel Controls */}
        <ConversionFunnel
          data={null}
          selectedMetrics={cmpFunnelMetrics}
          onMetricsChange={setCmpFunnelMetrics}
          drilldown={cmpFunnelDrilldown}
          onDrilldownChange={setCmpFunnelDrilldown}
        />

        {/* Funnels Side by Side - both use shared metrics/drilldown */}
        <div className="cmp-funnels-grid">
          <div className="cmp-funnel-card period1">
            <ConversionFunnel
              data={o1}
              title={p1Label}
              selectedMetrics={cmpFunnelMetrics}
              onMetricsChange={setCmpFunnelMetrics}
              drilldown={cmpFunnelDrilldown}
              onDrilldownChange={setCmpFunnelDrilldown}
              hideControls
            />
          </div>
          <div className="cmp-funnel-card period2">
            <ConversionFunnel
              data={o2}
              title={p2Label}
              selectedMetrics={cmpFunnelMetrics}
              onMetricsChange={setCmpFunnelMetrics}
              drilldown={cmpFunnelDrilldown}
              onDrilldownChange={setCmpFunnelDrilldown}
              hideControls
            />
          </div>
        </div>

        {/* Change Analysis Table - uses funnel metric order */}
        <div className="table-wrapper" style={{ marginTop: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0' }}>Change Analysis ({p1Label} vs {p2Label})</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Metric</th>
                <th>{p1Label}</th>
                <th>{p2Label}</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {cmpFunnelMetrics.map((key, idx) => {
                const metric = ALL_METRICS.find(m => m.key === key);
                const v1 = o1[key] || 0;
                const v2 = o2[key] || 0;
                const prevKey = idx > 0 ? cmpFunnelMetrics[idx - 1] : 'users';
                const prev1 = o1[prevKey] || o1.users || 1;
                const prev2 = o2[prevKey] || o2.users || 1;
                return (
                  <tr key={key}>
                    <td style={{ fontWeight: 600 }}>{metric?.label}</td>
                    <td>{formatValueOverall(v1, o1.users, prev1)}</td>
                    <td>{formatValueOverall(v2, o2.users, prev2)}</td>
                    <td>{formatDiff(v1, v2, o1.users, o2.users, prev1, prev2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Duration Analysis */}
        {renderDurationAnalysis()}
      </div>
    );
  };

  // ===== DURATION ANALYSIS =====
  const renderDurationAnalysis = () => {
    if (!data) return null;
    const o1 = p1.overall || {};
    const o2 = p2.overall || {};

    const dur1 = o1.total_call_duration || 0;
    const dur2 = o2.total_call_duration || 0;
    const conn1 = o1.call_connected_users || 1;
    const conn2 = o2.call_connected_users || 1;
    const users1 = o1.users || 1;
    const users2 = o2.users || 1;

    const durationRows = [
      { label: 'Total Duration', v1: formatDuration(dur1), v2: formatDuration(dur2) },
      { label: 'Avg/Connected', v1: formatDuration(dur1 / conn1), v2: formatDuration(dur2 / conn2) },
      { label: 'Avg/User', v1: formatDuration(dur1 / users1), v2: formatDuration(dur2 / users2) },
      { label: 'Connected Users', v1: conn1.toLocaleString(), v2: conn2.toLocaleString() },
      { label: 'Total Users', v1: users1.toLocaleString(), v2: users2.toLocaleString() }
    ];

    const calcTotals = (o) => {
      const tot = { u: 0, c: 0, wf: 0, wrt: 0, wri: 0, wct: 0, wci: 0 };
      DURATION_BUCKETS.forEach(b => {
        tot.u += o[`dur_${b.suffix}`] || 0;
        tot.c += o[`calls_${b.suffix}`] || 0;
        tot.wf += o[`wa_fail_${b.suffix}`] || 0;
        tot.wrt += o[`wa_reconn_${b.suffix}`] || 0;
        tot.wri += o[`wa_reconn_inb_${b.suffix}`] || 0;
        tot.wct += o[`wa_conn_${b.suffix}`] || 0;
        tot.wci += o[`wa_conn_inb_${b.suffix}`] || 0;
      });
      return tot;
    };
    const tot1 = calcTotals(o1);
    const tot2 = calcTotals(o2);

    return (
      <div style={{ marginTop: '20px' }}>
        <h3>Duration Analysis Comparison</h3>
        <div className="table-wrapper" style={{ marginBottom: '15px' }}>
          <div className="table-controls">
            <span style={{ fontWeight: 600 }}>Duration Averages</span>
          </div>
          <table className="data-table compact">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Metric</th>
                <th>P1</th>
                <th>P2</th>
              </tr>
            </thead>
            <tbody>
              {durationRows.map((m, i) => (
                <tr key={i}>
                  <td>{m.label}</td>
                  <td style={{ fontWeight: 600 }}>{m.v1}</td>
                  <td style={{ fontWeight: 600 }}>{m.v2}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-wrapper">
          <div className="table-controls">
            <span style={{ fontWeight: 600 }}>Call Duration Breakdown with WA Metrics</span>
          </div>
          <div className="table-scroll">
            <table className="data-table wa-table compact" style={{ fontSize: '9px' }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ textAlign: 'left' }}>Duration</th>
                  <th colSpan={2}>Users</th>
                  <th colSpan={2}>Calls</th>
                  <th colSpan={2} className="wa-fail-header">WA Fail</th>
                  <th colSpan={2} className="wa-reconn-header">Reconn Tot</th>
                  <th colSpan={2} className="wa-reconn-header">Reconn Inb</th>
                  <th colSpan={2} className="wa-conn-header">Conn Tot</th>
                  <th colSpan={2} className="wa-conn-header">Conn Inb</th>
                </tr>
                <tr>
                  {['P1','P2','P1','P2'].map((l,i) => <th key={`u${i}`} style={{ fontSize: '8px' }}>{l}</th>)}
                  <th style={{ fontSize: '8px' }} className="wa-fail-header">P1</th>
                  <th style={{ fontSize: '8px' }} className="wa-fail-header">P2</th>
                  <th style={{ fontSize: '8px' }} className="wa-reconn-header">P1</th>
                  <th style={{ fontSize: '8px' }} className="wa-reconn-header">P2</th>
                  <th style={{ fontSize: '8px' }} className="wa-reconn-header">P1</th>
                  <th style={{ fontSize: '8px' }} className="wa-reconn-header">P2</th>
                  <th style={{ fontSize: '8px' }} className="wa-conn-header">P1</th>
                  <th style={{ fontSize: '8px' }} className="wa-conn-header">P2</th>
                  <th style={{ fontSize: '8px' }} className="wa-conn-header">P1</th>
                  <th style={{ fontSize: '8px' }} className="wa-conn-header">P2</th>
                </tr>
              </thead>
              <tbody>
                {DURATION_BUCKETS.map(b => {
                  const s = b.suffix;
                  return (
                    <tr key={s}>
                      <td>{b.label}</td>
                      <td>{(o1[`dur_${s}`] || 0).toLocaleString()}</td>
                      <td>{(o2[`dur_${s}`] || 0).toLocaleString()}</td>
                      <td>{(o1[`calls_${s}`] || 0).toLocaleString()}</td>
                      <td>{(o2[`calls_${s}`] || 0).toLocaleString()}</td>
                      <td style={{ color: '#dc3545' }}>{o1[`wa_fail_${s}`] || 0}</td>
                      <td style={{ color: '#dc3545' }}>{o2[`wa_fail_${s}`] || 0}</td>
                      <td style={{ color: '#25D366' }}>{o1[`wa_reconn_${s}`] || 0}</td>
                      <td style={{ color: '#25D366' }}>{o2[`wa_reconn_${s}`] || 0}</td>
                      <td style={{ color: '#25D366' }}>{o1[`wa_reconn_inb_${s}`] || 0}</td>
                      <td style={{ color: '#25D366' }}>{o2[`wa_reconn_inb_${s}`] || 0}</td>
                      <td style={{ color: '#128C7E' }}>{o1[`wa_conn_${s}`] || 0}</td>
                      <td style={{ color: '#128C7E' }}>{o2[`wa_conn_${s}`] || 0}</td>
                      <td style={{ color: '#128C7E' }}>{o1[`wa_conn_inb_${s}`] || 0}</td>
                      <td style={{ color: '#128C7E' }}>{o2[`wa_conn_inb_${s}`] || 0}</td>
                    </tr>
                  );
                })}
                <tr className="total-row">
                  <td><strong>Total</strong></td>
                  <td><strong>{tot1.u.toLocaleString()}</strong></td>
                  <td><strong>{tot2.u.toLocaleString()}</strong></td>
                  <td><strong>{tot1.c.toLocaleString()}</strong></td>
                  <td><strong>{tot2.c.toLocaleString()}</strong></td>
                  <td style={{ color: '#dc3545', fontWeight: 700 }}>{tot1.wf}</td>
                  <td style={{ color: '#dc3545', fontWeight: 700 }}>{tot2.wf}</td>
                  <td style={{ color: '#25D366', fontWeight: 700 }}>{tot1.wrt}</td>
                  <td style={{ color: '#25D366', fontWeight: 700 }}>{tot2.wrt}</td>
                  <td style={{ color: '#25D366', fontWeight: 700 }}>{tot1.wri}</td>
                  <td style={{ color: '#25D366', fontWeight: 700 }}>{tot2.wri}</td>
                  <td style={{ color: '#128C7E', fontWeight: 700 }}>{tot1.wct}</td>
                  <td style={{ color: '#128C7E', fontWeight: 700 }}>{tot2.wct}</td>
                  <td style={{ color: '#128C7E', fontWeight: 700 }}>{tot1.wci}</td>
                  <td style={{ color: '#128C7E', fontWeight: 700 }}>{tot2.wci}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ===== COMPARISON TABLE (used for Pod, Recruiter, Daily) =====
  const renderComparisonTable = (data1, data2, keyCol, keyLabel) => {
    if (!data) return null;
    const allKeys = [...new Set([...data1.map(d => d[keyCol]), ...data2.map(d => d[keyCol])])].filter(k => k && k !== '(Not Assigned)');
    const map1 = Object.fromEntries(data1.map(d => [d[keyCol], d]));
    const map2 = Object.fromEntries(data2.map(d => [d[keyCol], d]));

    // Sort: dates ascending, entities by P1 users descending
    if (keyCol === 'date') {
      allKeys.sort((a, b) => a.localeCompare(b));
    } else {
      allKeys.sort((a, b) => ((map1[b] || {}).users || 0) - ((map1[a] || {}).users || 0));
    }

    // Calculate totals - always include 'users' for base calculations
    const metricsToSum = [...new Set(['users', ...effectiveMetrics])];
    const total1 = {}, total2 = {};
    metricsToSum.forEach(m => { total1[m] = 0; total2[m] = 0; });
    allKeys.forEach(key => {
      const r1 = map1[key] || {}, r2 = map2[key] || {};
      metricsToSum.forEach(m => {
        total1[m] += r1[m] || 0;
        total2[m] += r2[m] || 0;
      });
    });

    const isP1MinusP2 = diffDirection === 'p1-p2';

    return (
      <div className="table-wrapper">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th rowSpan={2} style={{ textAlign: 'left' }}>{keyLabel}</th>
                {effectiveMetrics.map(key => (
                  <th key={key} colSpan={3} style={{ textAlign: 'center', borderLeft: '2px solid #3d4a6a' }}>
                    {ALL_METRICS.find(m => m.key === key)?.label}
                  </th>
                ))}
              </tr>
              <tr>
                {effectiveMetrics.map(key => (
                  <React.Fragment key={key}>
                    <th style={{ fontSize: '8px' }}>P1</th>
                    <th style={{ fontSize: '8px' }}>P2</th>
                    <th style={{ fontSize: '8px' }}>&Delta;</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {allKeys.map(entityKey => {
                const r1 = map1[entityKey] || {};
                const r2 = map2[entityKey] || {};
                const base1 = r1.users || 1;
                const base2 = r2.users || 1;
                const displayKey = keyCol === 'date' ? entityKey : (entityKey || '').replace('@awign.com', '');

                return (
                  <tr key={entityKey}>
                    <td className="name-cell" style={{ fontWeight: 600 }}>{displayKey}</td>
                    {effectiveMetrics.map((key, metricIdx) => {
                      const v1 = r1[key] || 0;
                      const v2 = r2[key] || 0;
                      const prevKey = metricIdx > 0 ? effectiveMetrics[metricIdx - 1] : 'users';
                      const prev1 = r1[prevKey] || base1;
                      const prev2 = r2[prevKey] || base2;
                      return (
                        <React.Fragment key={key}>
                          <td style={{ borderLeft: '2px solid #eee' }}>{formatValue(v1, base1, prev1)}</td>
                          <td>{formatValue(v2, base2, prev2)}</td>
                          <td>{formatDiff(v1, v2, base1, base2, prev1, prev2)}</td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
              <tr className="total-row" style={{ background: '#f0f4f8' }}>
                <td><strong>TOTAL</strong></td>
                {effectiveMetrics.map((key, metricIdx) => {
                  const v1 = total1[key] || 0;
                  const v2 = total2[key] || 0;
                  const base1 = total1.users || 1;
                  const base2 = total2.users || 1;
                  const prevKey = metricIdx > 0 ? effectiveMetrics[metricIdx - 1] : 'users';
                  const prev1 = total1[prevKey] || base1;
                  const prev2 = total2[prevKey] || base2;
                  return (
                    <React.Fragment key={key}>
                      <td style={{ borderLeft: '2px solid #eee', fontWeight: 700 }}>{formatValue(v1, base1, prev1)}</td>
                      <td style={{ fontWeight: 700 }}>{formatValue(v2, base2, prev2)}</td>
                      <td style={{ fontWeight: 700 }}>{formatDiff(v1, v2, base1, base2, prev1, prev2)}</td>
                    </React.Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ===== DAILY VIEW =====
  const renderDailyComparison = () => {
    if (!data) return null;
    const p1Daily = p1.daily || [];
    const p2Daily = p2.daily || [];

    return (
      <div>
        <div className="chart-card" style={{ marginBottom: '20px' }}>
          <h3>Daily Comparison - Users</h3>
          <ComparisonChart
            period1Data={p1Daily}
            period2Data={p2Daily}
            labels={[...new Set([...p1Daily.map(d => d.date), ...p2Daily.map(d => d.date)])].sort()}
            metric="users"
          />
        </div>

        {renderComparisonTable(p1Daily, p2Daily, 'date', 'Date')}
      </div>
    );
  };

  // ===== HOURLY: Daily x Hourly Heatmap =====
  const renderHourlyDailyHeatmap = () => {
    if (!data) return null;
    const dataKeyMap = {
      'attempted': 'hourly_by_day',
      'connected': 'hourly_by_day_connected',
      'cv': 'hourly_by_day_cv',
      'match': 'hourly_by_day_match',
      'interest': 'hourly_by_day_interest'
    };
    const dataKey = dataKeyMap[heatmapTimestamp] || 'hourly_by_day';
    const hd1 = p1[dataKey] || [];
    const hd2 = p2[dataKey] || [];

    const allDates = [...new Set([...hd1.map(h => h.date), ...hd2.map(h => h.date)])].sort().reverse();
    const allHours = Array.from({ length: 18 }, (_, i) => i + 6);

    const makeMap = (arr) => {
      const map = {};
      arr.forEach(d => { if (!map[d.date]) map[d.date] = {}; map[d.date][d.hour] = d; });
      return map;
    };
    const map1 = makeMap(hd1);
    const map2 = makeMap(hd2);

    return (
      <div className="table-wrapper" style={{ marginTop: '15px' }}>
        <div className="table-controls">
          <span style={{ fontWeight: 600 }}>Daily x Hourly Heatmap</span>
          <div className="filter-group" style={{ marginLeft: 'auto' }}>
            <label>Timestamp:</label>
            <select value={heatmapTimestamp} onChange={(e) => setHeatmapTimestamp(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '11px' }}>
              <option value="attempted">First Call Attempted</option>
              <option value="connected">First Call Connected</option>
              <option value="cv">CV Generated</option>
              <option value="match">Matching Started</option>
              <option value="interest">Interest Shown</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Metric:</label>
            <select value={heatmapMetric} onChange={(e) => setHeatmapMetric(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '11px' }}>
              <option value="users">Users</option>
              <option value="call_connected_users">Connected</option>
              <option value="call_gt_4min">&gt;=4min</option>
              <option value="profile_80plus">80%+</option>
              <option value="profiling_linkedin_cv">CV</option>
              <option value="matching_job_found">Job Match</option>
              <option value="interest_shown">Interested</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table heatmap-table" style={{ fontSize: '9px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Date</th>
                {allHours.map(h => <th key={h} style={{ fontSize: '8px' }}>{formatHour(h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {allDates.map(date => (
                <tr key={date}>
                  <td style={{ fontWeight: 600 }}>{date}</td>
                  {allHours.map(h => {
                    const d1 = (map1[date] || {})[h];
                    const d2 = (map2[date] || {})[h];
                    if (d1 || d2) {
                      const u = (d1?.users || 0) + (d2?.users || 0);
                      const mv = (d1?.[heatmapMetric] || 0) + (d2?.[heatmapMetric] || 0);
                      const pct = u > 0 ? (mv / u * 100) : 0;
                      const intensity = Math.min(pct / 50, 1);
                      const bg = mv > 0 ? `rgba(46, 204, 113, ${0.2 + intensity * 0.6})` : '#f9f9f9';
                      const dv = heatmapMetric === 'users' ? u : mv;
                      return (
                        <td key={h} style={{ background: bg, textAlign: 'center' }}
                          title={`${u} users, ${mv} (${pct.toFixed(0)}%)`}>
                          {dv}
                          {heatmapMetric !== 'users' && <><br /><span style={{ fontSize: '8px', color: '#666' }}>{pct.toFixed(0)}%</span></>}
                        </td>
                      );
                    }
                    return <td key={h} style={{ background: '#f9f9f9', color: '#ccc', textAlign: 'center' }}>-</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ===== HOURLY: TAT Comparison =====
  const renderTatComparison = () => {
    if (!data) return null;
    const tat1 = p1.tat || [];
    const tat2 = p2.tat || [];
    if (tat1.length === 0 && tat2.length === 0) return null;

    const tatKeyMap = {
      'users': 'users', 'call_connected_users': 'connected', 'call_gt_4min': 'gte_4min',
      'profile_80plus': 'profile_80plus', 'profiling_linkedin_cv': 'has_cv',
      'matching_job_found': 'matched', 'interest_shown': 'interested'
    };

    const map1 = Object.fromEntries(tat1.map(t => [t.bucket, t]));
    const map2 = Object.fromEntries(tat2.map(t => [t.bucket, t]));

    let sortedBuckets = [...TAT_BUCKET_ORDER];
    if (tatSortCol !== 'bucket') {
      sortedBuckets.sort((a, b) => {
        const ta = map1[a] || {}, tb = map1[b] || {};
        const tk = tatKeyMap[tatSortCol] || tatSortCol;
        return tatSortDir === 'asc' ? (ta[tk] || 0) - (tb[tk] || 0) : (tb[tk] || 0) - (ta[tk] || 0);
      });
    } else if (tatSortDir === 'desc') {
      sortedBuckets.reverse();
    }

    const handleSort = (col) => {
      if (tatSortCol === col) setTatSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else { setTatSortCol(col); setTatSortDir(col === 'bucket' ? 'asc' : 'desc'); }
    };

    const sortIcon = (col) => tatSortCol === col ? (tatSortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
    const visibleMetrics = HOURLY_METRICS.filter(m => effectiveTatMetrics.includes(m.key));

    return (
      <div className="table-wrapper" style={{ marginTop: '15px' }}>
        <div className="table-controls">
          <span style={{ fontWeight: 600 }}>TAT (User Creation → First Call) Comparison</span>
          <div className="filter-group" style={{ marginLeft: 'auto' }}>
            <label>Metrics:</label>
            <MultiSelect
              options={HOURLY_METRICS.map(m => m.key)}
              selected={tatMetrics}
              onChange={setTatMetrics}
              placeholder="Select"
              renderOption={(opt) => HOURLY_METRICS.find(m => m.key === opt)?.label || opt}
            />
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table" style={{ fontSize: '9px' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSort('bucket')}>
                  TAT{sortIcon('bucket')}
                </th>
                {visibleMetrics.map(m => (
                  <th key={m.key} colSpan={2} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort(m.key)}>
                    {m.label}{sortIcon(m.key)}
                  </th>
                ))}
                <th colSpan={2} style={{ textAlign: 'center' }}>Int%</th>
              </tr>
              <tr>
                {visibleMetrics.map(m => (
                  <React.Fragment key={m.key}>
                    <th style={{ fontSize: '8px' }}>P1</th>
                    <th style={{ fontSize: '8px' }}>P2</th>
                  </React.Fragment>
                ))}
                <th style={{ fontSize: '8px' }}>P1</th>
                <th style={{ fontSize: '8px' }}>P2</th>
              </tr>
            </thead>
            <tbody>
              {sortedBuckets.map(bucket => {
                const t1 = map1[bucket] || {}, t2 = map2[bucket] || {};
                const u1 = t1.users || 1, u2 = t2.users || 1;
                return (
                  <tr key={bucket}>
                    <td style={{ fontWeight: 600 }}>{TAT_BUCKET_LABELS[bucket]}</td>
                    {visibleMetrics.map(m => {
                      const tk = tatKeyMap[m.key] || m.key;
                      return (
                        <React.Fragment key={m.key}>
                          <td>{(t1[tk] || 0).toLocaleString()}</td>
                          <td>{(t2[tk] || 0).toLocaleString()}</td>
                        </React.Fragment>
                      );
                    })}
                    <td style={{ fontWeight: 600, color: '#9b59b6' }}>{((t1.interested || 0) / u1 * 100).toFixed(1)}%</td>
                    <td style={{ fontWeight: 600, color: '#9b59b6' }}>{((t2.interested || 0) / u2 * 100).toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ===== HOURLY: TAT Milestones Comparison =====
  const renderTatMilestonesComparison = () => {
    if (!data) return null;
    const m1 = p1.tat_milestones;
    const m2 = p2.tat_milestones;
    if (!m1 && !m2) return null;

    const total1 = p1.overall?.users || 1;
    const total2 = p2.overall?.users || 1;

    const renderMilestoneTable = (title, data1, data2) => {
      if (!data1 && !data2) return null;
      const map1 = Object.fromEntries((data1 || []).map(d => [d.bucket, d]));
      const map2 = Object.fromEntries((data2 || []).map(d => [d.bucket, d]));

      return (
        <div className="table-wrapper">
          <div className="table-controls">
            <span style={{ fontWeight: 600 }}>{title}</span>
          </div>
          <table className="data-table compact" style={{ fontSize: '10px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Time Bucket</th>
                <th>P1</th>
                <th>P2</th>
                <th>P1 %</th>
                <th>P2 %</th>
              </tr>
            </thead>
            <tbody>
              {MILESTONE_BUCKET_ORDER.map(bucket => {
                const d1 = map1[bucket] || { count: 0, label: bucket };
                const d2 = map2[bucket] || { count: 0, label: bucket };
                const pct1 = (d1.count / total1 * 100).toFixed(1);
                const pct2 = (d2.count / total2 * 100).toFixed(1);
                const bgColor = bucket === 'not_reached' ? '#fff3f3' : (bucket === 'lt_1hr' ? '#e8f5e9' : '#fff');
                return (
                  <tr key={bucket} style={{ background: bgColor }}>
                    <td style={{ fontWeight: 600 }}>{d1.label || d2.label || bucket}</td>
                    <td>{(d1.count || 0).toLocaleString()}</td>
                    <td>{(d2.count || 0).toLocaleString()}</td>
                    <td>{pct1}%</td>
                    <td>{pct2}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    };

    return (
      <div style={{ marginTop: '20px' }}>
        <h3>TAT Milestones (First Call → Milestone) Comparison</h3>
        <div className="milestone-grid">
          {renderMilestoneTable('First Call → CV', m1?.to_cv, m2?.to_cv)}
          {renderMilestoneTable('First Call → Match', m1?.to_match, m2?.to_match)}
          {renderMilestoneTable('First Call → Interest', m1?.to_interest, m2?.to_interest)}
        </div>
      </div>
    );
  };

  // ===== HOURLY VIEW (main) =====
  const renderHourlyComparison = () => {
    if (!data) return null;
    const p1Hourly = p1.hourly || [];
    const p2Hourly = p2.hourly || [];

    const visibleMetrics = HOURLY_METRICS.filter(m => effectiveHourlyMetrics.includes(m.key));

    return (
      <div>
        <div className="table-wrapper">
          <div className="table-controls">
            <span style={{ fontWeight: 600 }}>Hourly Funnel Comparison (First Call Time - IST)</span>
            <div className="filter-group" style={{ marginLeft: 'auto' }}>
              <label>Metrics:</label>
              <MultiSelect
                options={HOURLY_METRICS.map(m => m.key)}
                selected={hourlyTableMetrics}
                onChange={setHourlyTableMetrics}
                placeholder="Select Metrics"
                renderOption={(opt) => HOURLY_METRICS.find(m => m.key === opt)?.label || opt}
              />
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ textAlign: 'left' }}>Hour (IST)</th>
                  {visibleMetrics.map(m => (
                    <th key={m.key} colSpan={2}>{m.label}</th>
                  ))}
                </tr>
                <tr>
                  {visibleMetrics.map(m => (
                    <React.Fragment key={m.key}>
                      <th style={{ fontSize: '8px' }}>P1</th>
                      <th style={{ fontSize: '8px' }}>P2</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 24 }, (_, h) => {
                  const r1 = p1Hourly.find(r => r.hour === h) || {};
                  const r2 = p2Hourly.find(r => r.hour === h) || {};
                  const u1 = r1.users || 1, u2 = r2.users || 1;
                  return (
                    <tr key={h}>
                      <td style={{ fontWeight: 600 }}>{formatHour(h)}</td>
                      {visibleMetrics.map(m => {
                        const v1 = r1[m.key] || 0;
                        const v2 = r2[m.key] || 0;
                        const pct1 = m.key !== 'users' ? ` (${(v1 / u1 * 100).toFixed(0)}%)` : '';
                        const pct2 = m.key !== 'users' ? ` (${(v2 / u2 * 100).toFixed(0)}%)` : '';
                        return (
                          <React.Fragment key={m.key}>
                            <td>{v1.toLocaleString()}<span className="pct-val">{pct1}</span></td>
                            <td>{v2.toLocaleString()}<span className="pct-val">{pct2}</span></td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {renderHourlyDailyHeatmap()}
        {renderTatComparison()}
        {renderTatMilestonesComparison()}
      </div>
    );
  };

  return (
    <div className="compare-tab">
      <h2>Period Comparison</h2>

      {/* Date Selection */}
      <div className="controls-bar">
        <label>Period 1:</label>
        <input type="date" value={period1Start} onChange={(e) => setPeriod1Start(e.target.value)} />
        <span>to</span>
        <input type="date" value={period1End} onChange={(e) => setPeriod1End(e.target.value)} />

        <label style={{ marginLeft: '15px' }}>Period 2:</label>
        <input type="date" value={period2Start} onChange={(e) => setPeriod2Start(e.target.value)} />
        <span>to</span>
        <input type="date" value={period2End} onChange={(e) => setPeriod2End(e.target.value)} />

        <button className="btn btn-primary" onClick={handleCompare} disabled={loading}>
          {loading ? 'Loading...' : 'Compare'}
        </button>
      </div>

      {/* View Tabs */}
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

      {/* Display Options */}
      <div className="controls-bar" style={{ padding: '10px', flexWrap: 'wrap' }}>
        <label>Display:</label>
        <div className="view-toggle">
          {['numbers', 'percentage', 'both', 'drilldown'].map(mode => (
            <button
              key={mode}
              className={`view-toggle-btn ${displayMode === mode ? 'active' : ''}`}
              onClick={() => setDisplayMode(mode)}
            >
              {mode === 'numbers' ? 'Numbers' : mode === 'percentage' ? '% of Base' : mode === 'both' ? 'Both' : 'Drill-down %'}
            </button>
          ))}
        </div>

        <span className="divider" />

        <label>Diff by:</label>
        <div className="view-toggle">
          <button className={`view-toggle-btn ${diffBy === 'number' ? 'active' : ''}`} onClick={() => setDiffBy('number')}>Number</button>
          <button className={`view-toggle-btn ${diffBy === 'percentage' ? 'active' : ''}`} onClick={() => setDiffBy('percentage')}>%</button>
        </div>

        <span className="divider" />

        <label>Direction:</label>
        <div className="view-toggle">
          <button className={`view-toggle-btn ${diffDirection === 'p1-p2' ? 'active' : ''}`} onClick={() => setDiffDirection('p1-p2')}>P1 &minus; P2</button>
          <button className={`view-toggle-btn ${diffDirection === 'p2-p1' ? 'active' : ''}`} onClick={() => setDiffDirection('p2-p1')}>P2 &minus; P1</button>
        </div>

        <span className="divider" />

        <div className="filter-group">
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

      {/* Content */}
      {!data ? (
        <div className="ready-state">Select dates for Period 1 and Period 2, then click Compare</div>
      ) : (
        <div className="comparison-content">
          {view === 'overall' && renderOverallComparison()}
          {view === 'pods' && renderComparisonTable(p1.pods || [], p2.pods || [], 'name', 'Pod (Team Manager)')}
          {view === 'recruiters' && renderComparisonTable(p1.recruiters || [], p2.recruiters || [], 'name', 'Recruiter')}
          {view === 'daily' && renderDailyComparison()}
          {view === 'hourly' && renderHourlyComparison()}
        </div>
      )}
    </div>
  );
};

export default CompareTab;
