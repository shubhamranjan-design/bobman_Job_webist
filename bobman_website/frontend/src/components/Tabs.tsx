interface TabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  counts?: {
    users: number;
    interested: number;
    matches: number;
    whatsapp: number;
    calls: number;
  };
}

const tabs = [
  { id: 'users', label: 'Users', icon: '👥', color: 'blue' },
  { id: 'interested', label: 'Interested', icon: '💼', color: 'green' },
  { id: 'matches', label: 'Matches', icon: '🔗', color: 'cyan' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬', color: 'emerald' },
  { id: 'calls', label: 'Calls', icon: '📞', color: 'amber' },
  { id: 'funnel', label: 'Funnel', icon: '📈', color: 'pink' },
  { id: 'jds', label: 'JDs', icon: '📋', color: 'indigo' },
  { id: 'analysis', label: 'Analysis', icon: '📊', color: 'violet' },
  { id: 'cohorts', label: 'Cohorts', icon: '🧪', color: 'purple' },
];

export function Tabs({ activeTab, onTabChange, counts }: TabsProps) {
  const getCount = (id: string) => {
    if (!counts) return null;
    switch (id) {
      case 'users': return counts.users;
      case 'interested': return counts.interested;
      case 'matches': return counts.matches;
      case 'whatsapp': return counts.whatsapp;
      case 'calls': return counts.calls;
      default: return null;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const count = getCount(tab.id);
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
              isActive
                ? 'bg-blue-500 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {count !== null && count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                isActive
                  ? 'bg-white/20'
                  : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
              }`}>
                {count > 999 ? '999+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
