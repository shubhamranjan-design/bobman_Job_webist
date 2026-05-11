// Dashboard is served at /dashboard/ base path
// API calls go through /dashboard/api → Node strips prefix → proxies to FastAPI on 8000
const API_BASE = '/dashboard/api';

// Fetch with auto-retry on 503/502 (Supabase stale connection recovery)
const fetchWithRetry = async (url, options = {}, retries = 2) => {
  const res = await fetch(url, options);
  if ((res.status === 503 || res.status === 502) && retries > 0) {
    await new Promise(r => setTimeout(r, 1000));
    return fetchWithRetry(url, options, retries - 1);
  }
  return res;
};

export const fetchSummary = async (startDate, endDate, filters = {}, { signal } = {}) => {
  let url = `${API_BASE}/summary?start_date=${startDate}&end_date=${endDate}`;

  if (filters.team_manager_email?.length) {
    url += `&team_manager_email=${encodeURIComponent(filters.team_manager_email.join(','))}`;
  }
  if (filters.recruiter_email?.length) {
    url += `&recruiter_email=${encodeURIComponent(filters.recruiter_email.join(','))}`;
  }
  if (filters.data_team_tag?.length) {
    url += `&data_team_tag=${encodeURIComponent(filters.data_team_tag.join(','))}`;
  }

  const res = await fetchWithRetry(url, { signal });
  return res.json();
};

export const fetchComparison = async (period1Start, period1End, period2Start, period2End, filters = {}) => {
  let url = `${API_BASE}/summary/compare?period1_start=${period1Start}&period1_end=${period1End}&period2_start=${period2Start}&period2_end=${period2End}`;

  if (filters.team_manager_email?.length) {
    url += `&team_manager_email=${encodeURIComponent(filters.team_manager_email.join(','))}`;
  }
  if (filters.recruiter_email?.length) {
    url += `&recruiter_email=${encodeURIComponent(filters.recruiter_email.join(','))}`;
  }
  if (filters.data_team_tag?.length) {
    url += `&data_team_tag=${encodeURIComponent(filters.data_team_tag.join(','))}`;
  }

  return fetchWithRetry(url).then(r => r.json());
};

export const fetchFilterOptions = async (startDate, endDate, filters = {}, { signal } = {}) => {
  let url = `${API_BASE}/summary/filters?start_date=${startDate}&end_date=${endDate}`;

  if (filters.team_manager_email?.length) {
    url += `&team_manager_email=${encodeURIComponent(filters.team_manager_email.join(','))}`;
  }
  if (filters.recruiter_email?.length) {
    url += `&recruiter_email=${encodeURIComponent(filters.recruiter_email.join(','))}`;
  }
  if (filters.data_team_tag?.length) {
    url += `&data_team_tag=${encodeURIComponent(filters.data_team_tag.join(','))}`;
  }

  const res = await fetchWithRetry(url, { signal });
  return res.json();
};

export const fetchUserFilterOptions = async () => {
  const res = await fetchWithRetry(`${API_BASE}/users/filter-options`);
  return res.json();
};

export const fetchUsersList = async (params) => {
  const searchParams = new URLSearchParams();
  searchParams.append('page', params.page || 1);
  searchParams.append('page_size', params.pageSize || 50);
  searchParams.append('sort_by', params.sortBy || 'created_at');
  searchParams.append('sort_dir', params.sortDir || 'desc');

  if (params.recruiterEmail) searchParams.append('recruiter_email', params.recruiterEmail);
  if (params.teamManagerEmail) searchParams.append('team_manager_email', params.teamManagerEmail);
  if (params.dataTeamTag) searchParams.append('data_team_tag', params.dataTeamTag);
  if (params.userStage) searchParams.append('user_stage', params.userStage);
  if (params.feedbackStatus) searchParams.append('feedback_status', params.feedbackStatus);
  if (params.dateFrom) searchParams.append('date_from', params.dateFrom);
  if (params.dateTo) searchParams.append('date_to', params.dateTo);
  if (params.qualificationFilter) searchParams.append('qualification_filter', params.qualificationFilter);

  const res = await fetchWithRetry(`${API_BASE}/users/list?${searchParams}`);
  return res.json();
};

export const searchUser = async (query, page = 1) => {
  const res = await fetchWithRetry(`${API_BASE}/user/search?q=${encodeURIComponent(query)}&page=${page}`);
  return res.json();
};

export const searchByRole = async (roleQuery, page = 1) => {
  const res = await fetchWithRetry(`${API_BASE}/users/by-role?role_query=${encodeURIComponent(roleQuery)}&page=${page}`);
  return res.json();
};

export const fetchScreeningSummary = async (startDate, endDate, filters = {}, { signal } = {}) => {
  let url = `${API_BASE}/screening-summary?start_date=${startDate}&end_date=${endDate}`;

  if (filters.team_manager_email?.length) {
    url += `&team_manager_email=${encodeURIComponent(filters.team_manager_email.join(','))}`;
  }
  if (filters.recruiter_email?.length) {
    url += `&recruiter_email=${encodeURIComponent(filters.recruiter_email.join(','))}`;
  }
  if (filters.data_team_tag?.length) {
    url += `&data_team_tag=${encodeURIComponent(filters.data_team_tag.join(','))}`;
  }

  const res = await fetchWithRetry(url, { signal });
  return res.json();
};

export const fetchRecruiterSummary = async (dateFrom, dateTo, userStage, filters = {}) => {
  let url = `${API_BASE}/recruiter-summary`;
  const params = [];
  if (dateFrom) params.push(`date_from=${dateFrom}`);
  if (dateTo) params.push(`date_to=${dateTo}`);
  if (userStage) params.push(`user_stage=${encodeURIComponent(userStage)}`);
  if (filters.data_team_tag?.length) params.push(`data_team_tag=${encodeURIComponent(filters.data_team_tag.join(','))}`);
  if (filters.team_manager_email?.length) params.push(`team_manager_email=${encodeURIComponent(filters.team_manager_email.join(','))}`);
  if (filters.recruiter_email?.length) params.push(`recruiter_email=${encodeURIComponent(filters.recruiter_email.join(','))}`);
  if (filters.qualification_filter) params.push(`qualification_filter=${encodeURIComponent(filters.qualification_filter)}`);
  if (params.length) url += '?' + params.join('&');
  const res = await fetchWithRetry(url);
  return res.json();
};

export const updateFeedbackStatus = async (userId, feedbackStatus, recruiterComments) => {
  const res = await fetchWithRetry(`${API_BASE}/users/${userId}/feedback`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      feedback_status: feedbackStatus,
      ...(recruiterComments != null ? { recruiter_comments: recruiterComments } : {})
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update feedback');
  }
  return res.json();
};

export const updateRecruiterComments = async (userId, comments) => {
  const res = await fetchWithRetry(`${API_BASE}/users/${userId}/comments`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recruiter_comments: comments })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update comments');
  }
  return res.json();
};

export { API_BASE };
