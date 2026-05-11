export interface User {
  id: string;
  name: string;
  phone_number: string;
  email: string;
  status: string;
  profile_completion_per: number;
  cv_file_url?: string;
  linkedin_url?: string;
  company?: string;
  created_at: string;
  updated_at?: string;
  cumulative_matches_count: number;
  jobs_interested_count: number;
  jobs_presented_count: number;
  linkedin_cv_text?: string;
  file_cv_text?: string;
  generated_cv_text?: string;
  call_cv_text?: string;
  interest_confirmed_jd_ids?: string;
  whatsapp_failed_attempt_count?: number;
  whatsapp_last_failure_reason?: string;
  recruiter_feedback_status?: string;
  team_manager_email?: string;
  recruiter_email?: string;
  referred_by_code?: string;
  referred_by_user_id?: string;
  total_calls?: number;
  successful_calls?: number;
}

export interface WhatsAppMessage {
  id: string;
  user_id: string;
  phone_number: string;
  message_text: string;
  direction: 'inbound' | 'outbound';
  status: string;
  created_at: string;
  sender?: string;
}

export interface Call {
  id: string;
  user_id: string;
  external_number: string;
  status: string;
  outcome?: string;
  call_duration_secs: number;
  created_at: string;
  ended_at?: string;
  reason?: string;
  elevenlabs_conversation_id?: string;
  transcript?: string;
  call_transcript?: string;
  call_stage?: number;
  // Additional fields from raw data
  [key: string]: any;
}

export interface Match {
  id: string;
  candidate_id: string;
  jd_id: string;
  matching_score: number;
  skills_score?: number;
  experience_score?: number;
  matched_at: string;
  status?: string;
}

export interface JD {
  id: string;
  role_code: string;
  role_name: string;
  job_title?: string;
  company_name?: string;
  location?: string;
  experience_required?: string;
  experience_range?: string;
  salary_range?: string;
  vendor_rate_per_month?: string;
  positions?: number;
  no_of_positions?: number;
  status: string;
  brief_context?: string;
  created_at?: string;
}

export interface Email {
  id: string;
  user_id: string;
  recruiter_email: string;
  email_subject: string;
  created_at: string;
  status?: string;
}

export interface DashboardStats {
  total_users: number;
  wa_connected: number;
  wa_failed: number;
  total_calls: number;
  successful_calls: number;
  total_call_duration: number;
  cvs_uploaded: number;
  interested_users: number;
  total_matches: number;
  emails_sent: number;
  active_jds: number;
}

export interface DashboardData {
  users: User[];
  whatsapp: WhatsAppMessage[];
  calls: Call[];
  matches: Match[];
  jds: JD[];
  emails: Email[];
  stats: DashboardStats;
  date_params: {
    start_date: string;
    end_date: string;
  };
}

export interface ProcessedUser extends User {
  whatsapp_stats: {
    total: number;
    outbound: number;
    inbound: number;
    last_message_at: string | null;
  };
  call_stats: {
    total: number;
    successful: number;
    no_answer: number;
    failed: number;
    total_duration: number;
  };
  messages: WhatsAppMessage[];
  user_calls: Call[];
}
