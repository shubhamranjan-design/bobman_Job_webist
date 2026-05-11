import type { DashboardStats } from '../types';

interface StatsGridProps {
  stats: DashboardStats | null;
  loading: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

interface StatCardProps {
  icon: string;
  value: number | string;
  label: string;
  color?: 'green' | 'cyan' | 'danger' | 'pink' | 'info' | 'warning' | 'default';
}

function StatCard({ icon, value, label, color = 'default' }: StatCardProps) {
  const colorClasses = {
    green: 'bg-green-50 dark:bg-green-900/20 border-green-500',
    cyan: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-500',
    danger: 'bg-red-50 dark:bg-red-900/20 border-red-500',
    pink: 'bg-pink-50 dark:bg-pink-900/20 border-pink-500',
    info: 'bg-sky-50 dark:bg-sky-900/20 border-sky-500',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-500',
    default: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
  };

  return (
    <div
      className={`${colorClasses[color]} border rounded-lg p-2.5 text-center transition-all hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-0.5">
        {label}
      </div>
    </div>
  );
}

export function StatsGrid({ stats, loading }: StatsGridProps) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-11 gap-2 mb-3">
        {[...Array(11)].map((_, i) => (
          <div key={i} className="bg-slate-200 dark:bg-slate-700 animate-pulse rounded-lg h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-2 mb-3">
      <StatCard icon="👥" value={stats.total_users} label="Total Users" />
      <StatCard icon="✅" value={stats.wa_connected} label="WA Connected" color="green" />
      <StatCard icon="❌" value={stats.wa_failed} label="WA Failed" color="danger" />
      <StatCard icon="📞" value={stats.total_calls} label="Total Calls" color="info" />
      <StatCard icon="✓" value={stats.successful_calls} label="Successful" color="green" />
      <StatCard
        icon="⏱️"
        value={formatDuration(stats.total_call_duration)}
        label="Duration"
        color="cyan"
      />
      <StatCard icon="📄" value={stats.cvs_uploaded} label="CVs" color="info" />
      <StatCard icon="💼" value={stats.interested_users} label="Interested" color="pink" />
      <StatCard icon="🔗" value={stats.total_matches} label="Matches" color="cyan" />
      <StatCard icon="📧" value={stats.emails_sent} label="Emails" color="warning" />
      <StatCard icon="📋" value={stats.active_jds} label="Active JDs" color="info" />
    </div>
  );
}
