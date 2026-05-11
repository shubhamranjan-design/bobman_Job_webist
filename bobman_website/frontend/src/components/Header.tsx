import { useState, useEffect } from 'react';

interface HeaderProps {
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
  onLoadData: () => void;
  loading?: boolean;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getDateBefore(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export function Header({ startDate, endDate, onDateChange, onLoadData, loading }: HeaderProps) {
  const [isDark, setIsDark] = useState(false);
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const [activeQuickBtn, setActiveQuickBtn] = useState<string | null>('today');

  useEffect(() => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const handleLoadData = () => {
    onDateChange(localStart, localEnd);
    setActiveQuickBtn(null);
    onLoadData();
  };

  const handleQuickDate = (type: string) => {
    let start: string;
    const end = getToday();

    switch (type) {
      case 'today':
        start = getToday();
        break;
      case 'yesterday':
        start = getDateBefore(1);
        break;
      case '7days':
        start = getDateBefore(7);
        break;
      case '30days':
        start = getDateBefore(30);
        break;
      case 'all':
        start = '2020-01-01';
        break;
      default:
        start = getToday();
    }

    setLocalStart(start);
    setLocalEnd(type === 'yesterday' ? getDateBefore(1) : end);
    setActiveQuickBtn(type);
    onDateChange(start, type === 'yesterday' ? getDateBefore(1) : end);
    onLoadData();
  };

  const quickBtnClass = (type: string) =>
    `px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
      activeQuickBtn === type
        ? 'bg-blue-500 text-white'
        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
    }`;

  return (
    <header className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-3">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-lg font-bold text-blue-500 flex items-center gap-2">
          <span>📊</span>
          <span>Recruiter Dashboard</span>
        </h1>

        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 border border-slate-200 dark:border-slate-600">
            <button
              onClick={() => setIsDark(false)}
              className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                !isDark ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              ☀️
            </button>
            <button
              onClick={() => setIsDark(true)}
              className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                isDark ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              🌙
            </button>
          </div>
        </div>
      </div>

      {/* Date Controls Row */}
      <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
        {/* Quick Date Buttons */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => handleQuickDate('today')} className={quickBtnClass('today')} disabled={loading}>
            Today
          </button>
          <button onClick={() => handleQuickDate('yesterday')} className={quickBtnClass('yesterday')} disabled={loading}>
            Yesterday
          </button>
          <button onClick={() => handleQuickDate('7days')} className={quickBtnClass('7days')} disabled={loading}>
            7 Days
          </button>
          <button onClick={() => handleQuickDate('30days')} className={quickBtnClass('30days')} disabled={loading}>
            30 Days
          </button>
          <button onClick={() => handleQuickDate('all')} className={quickBtnClass('all')} disabled={loading}>
            All
          </button>
        </div>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

        {/* Custom Date Range */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg px-2.5 py-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">From:</span>
            <input
              type="date"
              value={localStart}
              onChange={(e) => {
                setLocalStart(e.target.value);
                setActiveQuickBtn(null);
              }}
              className="bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none w-[120px]"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg px-2.5 py-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">To:</span>
            <input
              type="date"
              value={localEnd}
              onChange={(e) => {
                setLocalEnd(e.target.value);
                setActiveQuickBtn(null);
              }}
              className="bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none w-[120px]"
            />
          </div>

          <button
            onClick={handleLoadData}
            disabled={loading}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              loading
                ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {loading && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {loading ? 'Loading...' : '🔄 Load'}
          </button>
        </div>

        {/* Loading indicator */}
        {loading && (
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            Fetching data...
          </span>
        )}
      </div>
    </header>
  );
}
