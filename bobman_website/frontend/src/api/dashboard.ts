import type { DashboardData } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '';

// Summary data type - lightweight, no raw records
export interface DailySummary {
  date: string;
  users: number;
  calls: number;
  total_duration: number;
  connected_users: number;
  users_gte_4min: number;
  total_wa: number;
  wa_out: number;
  wa_in: number;
  wa_engaged_users: number;
  users_with_inbound: number;
  matches_users: number;
  interested: number;
  with_cv: number;
  profile_70plus: number;
  wa_failed: number;
  wa_reconnected: number;
  wa_connected: number;
}

export interface GroupBreakdown {
  name: string;
  users: number;
  calls: number;
  total_duration: number;
  connected_users: number;
  users_gte_4min: number;
  total_wa: number;
  wa_out: number;
  wa_in: number;
  wa_engaged_users: number;
  users_with_inbound: number;
  matches_users: number;
  interested: number;
  with_cv: number;
  profile_70plus: number;
  wa_failed: number;
  wa_reconnected: number;
  wa_connected: number;
}

export interface GroupDailyBreakdown extends GroupBreakdown {
  date: string;
}

export interface SummaryData {
  daily: DailySummary[];
  totals: {
    users: number;
    calls: number;
    total_duration: number;
    successful_calls: number;
    total_wa: number;
    total_matches: number;
    active_jds: number;
    wa_connected: number;
    wa_failed: number;
    users_with_inbound: number;
    cvs_uploaded: number;
    interested_users: number;
  };
  status_breakdown: Array<{ status: string; count: number }>;
  feedback_breakdown: Array<{ status: string; count: number }>;
  team_manager_breakdown: GroupBreakdown[];
  recruiter_breakdown: GroupBreakdown[];
  team_manager_daily: GroupDailyBreakdown[];
  recruiter_daily: GroupDailyBreakdown[];
  filters: {
    statuses: string[];
    feedback_statuses: string[];
    recruiters: string[];
    team_managers: string[];
  };
  date_params: {
    start_date: string;
    end_date: string;
  };
}

// Fetch summary only - fast, ~10KB response
export async function fetchDashboardSummary(startDate: string, endDate: string): Promise<SummaryData> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });

  const response = await fetch(`${API_URL}/api/dashboard/summary?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard summary');
  }
  return response.json();
}

// Fetch detailed data on demand
export async function fetchDashboardDetails(
  startDate: string,
  endDate: string,
  include: string[] = ['users']
): Promise<Partial<DashboardData>> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    include: include.join(','),
  });

  const response = await fetch(`${API_URL}/api/dashboard/details?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard details');
  }
  return response.json();
}

// Legacy full data fetch - use sparingly
export async function fetchDashboardData(startDate: string, endDate: string): Promise<DashboardData> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });

  const response = await fetch(`${API_URL}/api/dashboard?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard data');
  }
  return response.json();
}

export async function fetchUsers(startDate: string, endDate: string) {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });

  const response = await fetch(`${API_URL}/api/users?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }
  return response.json();
}

export async function fetchWhatsApp(startDate: string, endDate: string) {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });

  const response = await fetch(`${API_URL}/api/whatsapp?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch WhatsApp messages');
  }
  return response.json();
}

export async function fetchCalls(startDate: string, endDate: string) {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });

  const response = await fetch(`${API_URL}/api/calls?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch calls');
  }
  return response.json();
}

export async function fetchJDs() {
  const response = await fetch(`${API_URL}/api/jds`);
  if (!response.ok) {
    throw new Error('Failed to fetch JDs');
  }
  return response.json();
}
