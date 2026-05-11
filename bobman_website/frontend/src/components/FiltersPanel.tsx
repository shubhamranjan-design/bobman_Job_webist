import { useState } from 'react';

interface FiltersPanelProps {
  statuses: string[];
  recruiters: string[];
  teamManagers: string[];
  feedbackStatuses: string[];
  onFilterChange: (filters: FilterState) => void;
}

export interface FilterState {
  search: string;
  fromDate: string;
  toDate: string;
  status: string;
  recruiter: string;
  teamManager: string;
  feedbackStatus: string;
  // WhatsApp filters
  waOutCondition: string;
  waOutValue: string;
  waInCondition: string;
  waInValue: string;
  waTotalCondition: string;
  waTotalValue: string;
  // Call filters
  callTotalCondition: string;
  callTotalValue: string;
  callSuccessCondition: string;
  callSuccessValue: string;
  callNoAnswerCondition: string;
  callNoAnswerValue: string;
  callDurationCondition: string;
  callDurationValue: string;
  // Profile filters
  profileCondition: string;
  profileValue: string;
  matchScoreCondition: string;
  matchScoreValue: string;
  matchCountCondition: string;
  matchCountValue: string;
  hasCV: string;
  hasInterest: string;
  commType: string;
  waStatus: string;
  msgStatus: string;
}

const defaultFilters: FilterState = {
  search: '',
  fromDate: '',
  toDate: '',
  status: '',
  recruiter: '',
  teamManager: '',
  feedbackStatus: '',
  waOutCondition: '',
  waOutValue: '',
  waInCondition: '',
  waInValue: '',
  waTotalCondition: '',
  waTotalValue: '',
  callTotalCondition: '',
  callTotalValue: '',
  callSuccessCondition: '',
  callSuccessValue: '',
  callNoAnswerCondition: '',
  callNoAnswerValue: '',
  callDurationCondition: '',
  callDurationValue: '',
  profileCondition: '',
  profileValue: '',
  matchScoreCondition: '',
  matchScoreValue: '',
  matchCountCondition: '',
  matchCountValue: '',
  hasCV: '',
  hasInterest: '',
  commType: '',
  waStatus: '',
  msgStatus: '',
};

export function FiltersPanel({ statuses, recruiters, teamManagers, feedbackStatuses, onFilterChange }: FiltersPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const handleChange = (field: keyof FilterState, value: string) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    onFilterChange(defaultFilters);
  };

  const ConditionSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-14 px-1 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-xs outline-none"
    >
      <option value="">-</option>
      <option value="gt">&gt;</option>
      <option value="gte">≥</option>
      <option value="lt">&lt;</option>
      <option value="lte">≤</option>
      <option value="eq">=</option>
    </select>
  );

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-3 overflow-hidden">
      <div
        className="p-3 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <span className={`transition-transform text-xs ${isOpen ? 'rotate-90' : ''}`}>▶</span>
          🔍 Advanced Filters & Search
        </h3>
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFilterChange(filters);
            }}
            className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Apply
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetFilters();
            }}
            className="text-xs px-3 py-1 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-300 dark:hover:bg-slate-500"
          >
            Reset
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-3 pt-0 border-t border-slate-200 dark:border-slate-700">
          {/* Common Filters */}
          <div className="mt-3">
            <div className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-2">🌐 Common</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-500 uppercase mb-1 block">🔎 Search</label>
                <input
                  type="text"
                  placeholder="Name, phone, email..."
                  value={filters.search}
                  onChange={(e) => handleChange('search', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📅 From</label>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => handleChange('fromDate', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📅 To</label>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => handleChange('toDate', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📋 Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
                >
                  <option value="">All</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">👤 Recruiter</label>
                <select
                  value={filters.recruiter}
                  onChange={(e) => handleChange('recruiter', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
                >
                  <option value="">All Recruiters</option>
                  {recruiters.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">👥 Team Manager</label>
                <select
                  value={filters.teamManager}
                  onChange={(e) => handleChange('teamManager', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
                >
                  <option value="">All Team Managers</option>
                  {teamManagers.map((tm) => (
                    <option key={tm} value={tm}>{tm}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📝 Feedback</label>
                <select
                  value={filters.feedbackStatus}
                  onChange={(e) => handleChange('feedbackStatus', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
                >
                  <option value="">All Feedback</option>
                  {feedbackStatuses.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* WhatsApp Filters */}
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-green-500 uppercase tracking-wide mb-2">💬 WhatsApp</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📤 Out</label>
                <div className="flex gap-1">
                  <ConditionSelect value={filters.waOutCondition} onChange={(v) => handleChange('waOutCondition', v)} />
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.waOutValue}
                    onChange={(e) => handleChange('waOutValue', e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm outline-none w-16"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📥 In</label>
                <div className="flex gap-1">
                  <ConditionSelect value={filters.waInCondition} onChange={(v) => handleChange('waInCondition', v)} />
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.waInValue}
                    onChange={(e) => handleChange('waInValue', e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm outline-none w-16"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📊 Total</label>
                <div className="flex gap-1">
                  <ConditionSelect value={filters.waTotalCondition} onChange={(v) => handleChange('waTotalCondition', v)} />
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.waTotalValue}
                    onChange={(e) => handleChange('waTotalValue', e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm outline-none w-16"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">💬 WA Status</label>
                <select
                  value={filters.waStatus}
                  onChange={(e) => handleChange('waStatus', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
                >
                  <option value="">All</option>
                  <option value="connected">✓ Connected</option>
                  <option value="failed">✕ Failed</option>
                  <option value="reconnected">↺ Reconnected</option>
                  <option value="none">○ None</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📨 Msg Status</label>
                <select
                  value={filters.msgStatus}
                  onChange={(e) => handleChange('msgStatus', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
                >
                  <option value="">All</option>
                  <option value="has_failed">Has Failed</option>
                  <option value="all_delivered">All Delivered</option>
                </select>
              </div>
            </div>
          </div>

          {/* Call Filters */}
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-amber-500 uppercase tracking-wide mb-2">📞 Calls</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📊 Total</label>
                <div className="flex gap-1">
                  <ConditionSelect value={filters.callTotalCondition} onChange={(v) => handleChange('callTotalCondition', v)} />
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.callTotalValue}
                    onChange={(e) => handleChange('callTotalValue', e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm outline-none w-16"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">✅ Success</label>
                <div className="flex gap-1">
                  <ConditionSelect value={filters.callSuccessCondition} onChange={(v) => handleChange('callSuccessCondition', v)} />
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.callSuccessValue}
                    onChange={(e) => handleChange('callSuccessValue', e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm outline-none w-16"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">🚫 No Answer</label>
                <div className="flex gap-1">
                  <ConditionSelect value={filters.callNoAnswerCondition} onChange={(v) => handleChange('callNoAnswerCondition', v)} />
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.callNoAnswerValue}
                    onChange={(e) => handleChange('callNoAnswerValue', e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm outline-none w-16"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">⏱️ Duration (s)</label>
                <div className="flex gap-1">
                  <ConditionSelect value={filters.callDurationCondition} onChange={(v) => handleChange('callDurationCondition', v)} />
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.callDurationValue}
                    onChange={(e) => handleChange('callDurationValue', e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm outline-none w-16"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Profile Filters */}
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-cyan-500 uppercase tracking-wide mb-2">👤 Profile</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📊 Profile %</label>
                <div className="flex gap-1">
                  <ConditionSelect value={filters.profileCondition} onChange={(v) => handleChange('profileCondition', v)} />
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.profileValue}
                    onChange={(e) => handleChange('profileValue', e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm outline-none w-16"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">⭐ Score</label>
                <div className="flex gap-1">
                  <ConditionSelect value={filters.matchScoreCondition} onChange={(v) => handleChange('matchScoreCondition', v)} />
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.matchScoreValue}
                    onChange={(e) => handleChange('matchScoreValue', e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm outline-none w-16"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">🎯 Matches</label>
                <div className="flex gap-1">
                  <ConditionSelect value={filters.matchCountCondition} onChange={(v) => handleChange('matchCountCondition', v)} />
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.matchCountValue}
                    onChange={(e) => handleChange('matchCountValue', e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm outline-none w-16"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📄 CV</label>
                <select
                  value={filters.hasCV}
                  onChange={(e) => handleChange('hasCV', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
                >
                  <option value="">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">✅ Interest</label>
                <select
                  value={filters.hasInterest}
                  onChange={(e) => handleChange('hasInterest', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
                >
                  <option value="">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase mb-1 block">📞 Comm Type</label>
                <select
                  value={filters.commType}
                  onChange={(e) => handleChange('commType', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none"
                >
                  <option value="">All</option>
                  <option value="calls">Calls Only</option>
                  <option value="wa">WA Only</option>
                  <option value="both">Both</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
