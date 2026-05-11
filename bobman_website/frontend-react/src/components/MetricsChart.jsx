import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

const CHART_COLORS = [
  'rgba(233, 69, 96, 0.8)',   // Primary red
  'rgba(22, 33, 62, 0.8)',    // Dark blue
  'rgba(0, 184, 148, 0.8)',   // Green
  'rgba(74, 144, 217, 0.8)',  // Blue
  'rgba(255, 159, 64, 0.8)',  // Orange
  'rgba(153, 102, 255, 0.8)', // Purple
  'rgba(255, 205, 86, 0.8)',  // Yellow
  'rgba(75, 192, 192, 0.8)',  // Teal
];

export const MetricsBarChart = ({ data, labels, metrics, title, singleGroup, showValues }) => {
  if (!data || !metrics?.length) return null;

  let chartData;

  if (singleGroup) {
    // Single-group mode: all metrics as individual bars (Metrics Overview)
    const overall = data[0] || {};
    chartData = {
      labels: metrics.map(m => m.label),
      datasets: [{
        data: metrics.map(m => overall[m.key] || 0),
        backgroundColor: '#e94560',
        borderRadius: 4
      }]
    };
  } else {
    // Multi-group mode: grouped bars per label (Recruiter Performance)
    chartData = {
      labels,
      datasets: metrics.map((metric, idx) => ({
        label: metric.label,
        data: data.map(d => d[metric.key] || 0),
        backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
        borderColor: CHART_COLORS[idx % CHART_COLORS.length].replace('0.8', '1'),
        borderWidth: 1,
        borderRadius: 4
      }))
    };
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: !singleGroup, position: 'top', labels: { font: { size: 10 } } },
      title: { display: !!title, text: title, font: { size: 14 } },
      tooltip: {
        callbacks: {
          label: function(context) {
            const val = context.parsed.y;
            if (showValues && data.length > 0) {
              const row = data[context.dataIndex];
              const baseUsers = row?.users || 1;
              const pct = ((val / baseUsers) * 100).toFixed(1);
              return `${context.dataset.label}: ${val.toLocaleString()} (${pct}% of users)`;
            }
            return singleGroup
              ? `${context.label}: ${val.toLocaleString()}`
              : `${context.dataset.label}: ${val.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      y: { beginAtZero: true },
      x: {
        ticks: { font: { size: singleGroup ? 8 : 10 }, maxRotation: singleGroup ? 45 : 0 }
      }
    }
  };

  return (
    <div style={{ height: '280px' }}>
      <Bar data={chartData} options={options} />
    </div>
  );
};

export const MetricsLineChart = ({ data, labels, metrics, title }) => {
  if (!data || !labels?.length) return null;

  const chartData = {
    labels,
    datasets: metrics.map((metric, idx) => ({
      label: metric.label,
      data: data.map(d => d[metric.key] || 0),
      borderColor: CHART_COLORS[idx % CHART_COLORS.length],
      backgroundColor: CHART_COLORS[idx % CHART_COLORS.length].replace('0.8', '0.1'),
      fill: false,
      tension: 0.3
    }))
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { font: { size: 10 } } },
      title: { display: !!title, text: title, font: { size: 14 } }
    },
    scales: {
      y: { beginAtZero: true }
    }
  };

  return (
    <div style={{ height: '280px' }}>
      <Line data={chartData} options={options} />
    </div>
  );
};

export const ComparisonChart = ({ period1Data, period2Data, labels, metric, title }) => {
  if (!period1Data || !period2Data || !labels?.length) return null;

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Period 1',
        data: period1Data.map(d => d[metric] || 0),
        backgroundColor: 'rgba(233, 69, 96, 0.7)',
        borderColor: 'rgba(233, 69, 96, 1)',
        borderWidth: 1
      },
      {
        label: 'Period 2',
        data: period2Data.map(d => d[metric] || 0),
        backgroundColor: 'rgba(22, 33, 62, 0.7)',
        borderColor: 'rgba(22, 33, 62, 1)',
        borderWidth: 1
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { font: { size: 10 } } },
      title: { display: !!title, text: title, font: { size: 14 } }
    },
    scales: {
      y: { beginAtZero: true }
    }
  };

  return (
    <div style={{ height: '280px' }}>
      <Bar data={chartData} options={options} />
    </div>
  );
};

export default MetricsBarChart;
