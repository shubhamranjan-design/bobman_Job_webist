import { useState, useEffect, useRef, useCallback } from 'react';
import OverviewTab from './components/OverviewTab';
import CohortTab from './components/CohortTab';
import RecruitersTab from './components/RecruitersTab';
import PodsTab from './components/PodsTab';
import CompareTab from './components/CompareTab';
import UserLookupTab from './components/UserLookupTab';
import ScreeningTab from './components/ScreeningTab';
import RecruiterSummaryTab from './components/RecruiterSummaryTab';
import MultiSelect from './components/MultiSelect';
import LoginPage from './components/LoginPage';
import { fetchSummary, fetchComparison, fetchFilterOptions, fetchScreeningSummary } from './utils/api';
import './styles/Dashboard.css';

const ALL_TABS = [
  { id: 'overview', label: 'Overview', icon: '📊', roles: ['admin'] },
  { id: 'cohorts', label: 'Cohort Analysis', icon: '📈', roles: ['admin'] },
  { id: 'recruiters', label: 'Recruiters', icon: '👥', roles: ['admin'] },
  { id: 'pods', label: 'Pods', icon: '🏢', roles: ['admin'] },
  { id: 'compare', label: 'Compare', icon: '⚖️', roles: ['admin'] },
  { id: 'screening', label: 'Screening', icon: '🔍', roles: ['admin', 'recruiter'] },
  { id: 'rec-summary', label: 'Recruiter Summary', icon: '📋', roles: ['admin', 'recruiter'] },
  { id: 'users', label: 'User Lookup', icon: '👤', roles: ['admin', 'recruiter'] }
];

// Session persistence helpers
const STORAGE_KEY_FILTERS = 'dashboard_filters';

const saveFiltersToSession = (state) => {
  try {
    sessionStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(state));
  } catch {}
};

const loadFiltersFromSession = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_FILTERS);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

function App() {
  // Auth state — restore from sessionStorage on mount
  const [user, setUser] = useState(() => {
    try {
      const raw = sessionStorage.getItem('dashboard_auth');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Restore persisted filters or use defaults
  const saved = loadFiltersFromSession();
  const today = new Date().toISOString().split('T')[0];

  const defaultTab = user?.role === 'recruiter' ? 'users' : 'overview';
  const [activeTab, setActiveTab] = useState(saved?.activeTab || defaultTab);
  const [startDate, setStartDate] = useState(saved?.startDate || today);
  const [endDate, setEndDate] = useState(saved?.endDate || today);
  const [summaryData, setSummaryData] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [screeningData, setScreeningData] = useState(null);
  const [lookupUserId, setLookupUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const [viewMode, setViewMode] = useState(saved?.viewMode || 'both');
  const [percentageBase, setPercentageBase] = useState(saved?.percentageBase || 'users');
  const [globalFilters, setGlobalFilters] = useState(() => {
    const defaults = {
      team_manager_email: [],
      recruiter_email: [],
      data_team_tag: user?.lockedFilters?.data_team_tag || []
    };
    return saved?.globalFilters ? { ...defaults, ...saved.globalFilters } : defaults;
  });

  // Persist filters to sessionStorage on change
  useEffect(() => {
    saveFiltersToSession({ globalFilters, startDate, endDate, viewMode, percentageBase, activeTab });
  }, [globalFilters, startDate, endDate, viewMode, percentageBase, activeTab]);

  // Keep a ref to always have current filter values in async callbacks
  const filtersRef = useRef(globalFilters);
  filtersRef.current = globalFilters;

  const loadFilterOptions = async (start, end) => {
    try {
      const data = await fetchFilterOptions(start, end, filtersRef.current);
      setFilterOptions(data);
    } catch (err) {
      console.error('Error loading filter options:', err);
    }
  };

  // AbortController ref — cancel pending requests when a new load starts
  const abortRef = useRef(null);

  // loadData can optionally take explicit dates (for presets which set dates + load)
  const loadData = async (overrideStart, overrideEnd) => {
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const s = overrideStart || startDate;
    const e = overrideEnd || endDate;
    setLoading(true);
    try {
      // Reload filter options first (matches HTML dashboard behavior)
      await loadFilterOptions(s, e);
      const filters = {
        team_manager_email: filtersRef.current.team_manager_email.filter(v => v !== '__NONE__'),
        recruiter_email: filtersRef.current.recruiter_email.filter(v => v !== '__NONE__'),
        data_team_tag: filtersRef.current.data_team_tag.filter(v => v !== '__NONE__')
      };
      const [data, screenData] = await Promise.all([
        fetchSummary(s, e, filters, { signal }),
        fetchScreeningSummary(s, e, filters, { signal })
      ]);
      setSummaryData(data);
      setScreeningData(screenData);
    } catch (err) {
      if (err.name === 'AbortError') return; // request was cancelled, ignore
      console.error('Error loading data:', err);
    }
    setLoading(false);
  };

  // Tabs that need summary+screening data from the global loadData
  const GLOBAL_DATA_TABS = ['overview', 'cohorts', 'recruiters', 'pods', 'compare', 'screening'];

  // On mount, only load global data if the active tab actually needs it
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (user && GLOBAL_DATA_TABS.includes(activeTab)) loadData();
    hasMountedRef.current = true;
  }, [user]);

  // Lazy-load global data when switching to a tab that needs it (if not yet loaded)
  useEffect(() => {
    if (!hasMountedRef.current) return; // skip initial mount (handled above)
    if (user && GLOBAL_DATA_TABS.includes(activeTab) && !summaryData) {
      loadData();
    }
  }, [activeTab]);

  const handleCompare = async (p1Start, p1End, p2Start, p2End) => {
    try {
      const filters = {
        team_manager_email: filtersRef.current.team_manager_email.filter(v => v !== '__NONE__'),
        recruiter_email: filtersRef.current.recruiter_email.filter(v => v !== '__NONE__'),
        data_team_tag: filtersRef.current.data_team_tag.filter(v => v !== '__NONE__')
      };
      const data = await fetchComparison(p1Start, p1End, p2Start, p2End, filters);
      setCompareData(data);
    } catch (err) {
      console.error('Error comparing:', err);
    }
  };

  // Filters to pre-apply in UserLookupTab (set by RecruiterSummaryTab navigation)
  const [lookupFilters, setLookupFilters] = useState(null);

  // Track which tab the user came from (for back button)
  const [previousTab, setPreviousTab] = useState(null);

  // Handler: click candidate in ScreeningTab → switch to UserLookup with that user
  const handleSelectUser = (userId) => {
    setPreviousTab(activeTab);
    setLookupUserId(userId);
    setActiveTab('users');
  };

  // Handler: back button in UserLookup → return to previous tab
  const handleBackFromLookup = () => {
    const target = previousTab || 'screening';
    setPreviousTab(null);
    setActiveTab(target);
  };

  // Handler: click cell in RecruiterSummaryTab → switch to UserLookup with pre-applied filters
  const handleNavigateToUserLookup = (filters) => {
    setPreviousTab('rec-summary');
    setLookupFilters(filters);
    setActiveTab('users');
  };

  // Preset dates: sets dates AND auto-loads data (matches HTML behavior)
  const setPresetDates = (preset) => {
    const today = new Date();
    let start, end;

    switch (preset) {
      case 'today':
        start = end = today.toISOString().split('T')[0];
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        start = end = yesterday.toISOString().split('T')[0];
        break;
      case 'last7':
        const last7 = new Date(today);
        last7.setDate(today.getDate() - 6);
        start = last7.toISOString().split('T')[0];
        end = today.toISOString().split('T')[0];
        break;
      case 'last30':
        const last30 = new Date(today);
        last30.setDate(today.getDate() - 29);
        start = last30.toISOString().split('T')[0];
        end = today.toISOString().split('T')[0];
        break;
      default:
        return;
    }

    setStartDate(start);
    setEndDate(end);
    // Auto-load with new dates (pass explicitly since state update is async)
    loadData(start, end);
  };

  const handleApplyFilters = () => {
    loadData();
  };

  const clearAllFilters = () => {
    const cleared = {
      team_manager_email: [],
      recruiter_email: [],
      data_team_tag: user?.lockedFilters?.data_team_tag || []
    };
    setGlobalFilters(cleared);
    filtersRef.current = cleared;
    loadData();
  };

  const handleLogin = useCallback((authData) => {
    setUser(authData);
    // Set default tab for role
    const tab = authData.role === 'recruiter' ? 'users' : 'overview';
    setActiveTab(tab);
    // Apply locked filters (e.g. data_team_tag for restricted accounts)
    if (authData.lockedFilters) {
      setGlobalFilters(prev => ({ ...prev, ...authData.lockedFilters }));
    }
  }, []);

  const handleLogout = () => {
    setUser(null);
    sessionStorage.removeItem('dashboard_auth');
    sessionStorage.removeItem(STORAGE_KEY_FILTERS);
    sessionStorage.removeItem('screening_filters');
  };

  // If not logged in, show login page
  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Filter tabs based on user role
  const tabs = ALL_TABS.filter(t => t.roles.includes(user.role));

  const activeFiltersCount =
    globalFilters.team_manager_email.filter(v => v !== '__NONE__').length +
    globalFilters.recruiter_email.filter(v => v !== '__NONE__').length +
    globalFilters.data_team_tag.filter(v => v !== '__NONE__').length;

  return (
    <div className="dashboard-container">
      {/* Always-visible user bar */}
      <div className="user-bar">
        <span className="user-bar-info">
          {user.email} <span className="user-bar-role">{user.role}</span>
        </span>
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
      </div>

      {/* Header */}
      <header className="header" style={activeTab === 'users' || activeTab === 'rec-summary' ? { display: 'none' } : {}}>
        <div style={{ marginBottom: 15 }}>
          <h1 style={{ marginBottom: 0 }}>Recruiter Performance Dashboard</h1>
        </div>
        <div className="date-controls">
          <label>From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <label>To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => loadData()} disabled={loading}>
            {loading ? 'Loading...' : 'Load'}
          </button>
          <span className="divider" />
          <button className="btn preset-btn" onClick={() => setPresetDates('today')}>Today</button>
          <button className="btn preset-btn" onClick={() => setPresetDates('yesterday')}>Yesterday</button>
          <button className="btn preset-btn" onClick={() => setPresetDates('last7')}>Last 7 Days</button>
          <button className="btn preset-btn" onClick={() => setPresetDates('last30')}>Last 30 Days</button>
          <span className="divider" />
          <label>View:</label>
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
            <option value="numbers">Numbers</option>
            <option value="percentage">Percentage</option>
            <option value="both">Both</option>
            <option value="drilldown">Drill-down %</option>
          </select>
          <label>% Base:</label>
          <select value={percentageBase} onChange={(e) => setPercentageBase(e.target.value)}>
            <option value="users">Users</option>
            <option value="call_connected_users">Connected</option>
            <option value="call_gt_4min">&gt;=4min</option>
            <option value="profiling_calling">Profiled</option>
          </select>
        </div>
      </header>

      {/* Global Filters */}
      {activeTab !== 'users' && activeTab !== 'rec-summary' && (
        <div className="global-filters">
          <label>Filters:</label>
          <div className="filter-group">
            <label>Pod (Manager)</label>
            <MultiSelect
              options={filterOptions.team_manager_email || []}
              selected={globalFilters.team_manager_email}
              onChange={(v) => setGlobalFilters({ ...globalFilters, team_manager_email: v })}
              placeholder="All Pods"
              allLabel="All"
            />
          </div>
          <div className="filter-group">
            <label>Recruiter</label>
            <MultiSelect
              options={filterOptions.recruiter_email || []}
              selected={globalFilters.recruiter_email}
              onChange={(v) => setGlobalFilters({ ...globalFilters, recruiter_email: v })}
              placeholder="All Recruiters"
              allLabel="All"
            />
          </div>
          <div className="filter-group">
            <label>Data Tag</label>
            {user.lockedFilters?.data_team_tag ? (
              <span className="locked-filter-value">{user.lockedFilters.data_team_tag.join(', ')}</span>
            ) : (
              <MultiSelect
                options={filterOptions.data_team_tag || []}
                selected={globalFilters.data_team_tag}
                onChange={(v) => setGlobalFilters({ ...globalFilters, data_team_tag: v })}
                placeholder="All Tags"
                allLabel="All"
              />
            )}
          </div>
          <button className="btn btn-primary" onClick={handleApplyFilters}>Apply Filters</button>
          <button className="btn btn-secondary" onClick={clearAllFilters}>Clear</button>
          {activeFiltersCount > 0 && (
            <span className="filter-count">
              ({activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''} active)
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <main>
        {loading && <div className="loading">Loading...</div>}

        {!loading && activeTab === 'overview' && (
          <OverviewTab
            data={summaryData}
            viewMode={viewMode}
            percentageBase={percentageBase}
          />
        )}

        {!loading && activeTab === 'cohorts' && (
          <CohortTab data={summaryData} viewMode={viewMode} percentageBase={percentageBase} />
        )}

        {!loading && activeTab === 'recruiters' && (
          <RecruitersTab data={summaryData} viewMode={viewMode} percentageBase={percentageBase} />
        )}

        {!loading && activeTab === 'pods' && (
          <PodsTab data={summaryData} viewMode={viewMode} percentageBase={percentageBase} />
        )}

        {activeTab === 'compare' && (
          <CompareTab data={compareData} onCompare={handleCompare} />
        )}

        {!loading && activeTab === 'screening' && (
          <ScreeningTab data={screeningData} onSelectUser={handleSelectUser} userEmail={user?.email} />
        )}

        {activeTab === 'rec-summary' && (
          <RecruiterSummaryTab onNavigateToUserLookup={handleNavigateToUserLookup} lockedFilters={user?.lockedFilters} />
        )}

        {activeTab === 'users' && (
          <UserLookupTab
            initialUserId={lookupUserId}
            onConsumeUserId={() => setLookupUserId(null)}
            onBack={previousTab ? handleBackFromLookup : null}
            previousTabLabel={previousTab === 'screening' ? 'Screening' : previousTab ? tabs.find(t => t.id === previousTab)?.label : null}
            lookupFilters={lookupFilters}
            onConsumeLookupFilters={() => setLookupFilters(null)}
            lockedFilters={user?.lockedFilters}
            userEmail={user?.email}
          />
        )}
      </main>

      {/* Footer */}
      <footer>
        Recruiter Dashboard PWA • Built with React + Vite
      </footer>
    </div>
  );
}

export default App;
