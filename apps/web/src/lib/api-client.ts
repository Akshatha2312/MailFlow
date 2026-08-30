export interface User {
  id: string;
  email: string;
  name?: string | null;
  avatar?: string | null;
  createdAt: string;
}

export interface Sender {
  id: string;
  email: string;
  name?: string | null;
  smtpHost: string;
  smtpPort: number;
  hourlyLimit: number;
  isDefault?: boolean;
}

export interface EmailJob {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  status: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';
  attempts: number;
  maxAttempts: number;
  sentAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  bullJobId?: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  sender?: Sender;
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  recipients: string[];
  senderId: string;
  startTime?: string;
  delaySeconds?: number;
  idempotencyKeyPrefix?: string;
}

export interface ScheduleResponse {
  message: string;
  scheduledCount: number;
  jobs: EmailJob[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListEmailJobsResponse {
  data: EmailJob[];
  pagination: Pagination;
}

export interface SearchResponse {
  data: EmailJob[];
  total: number;
  page: number;
  limit: number;
  fromElasticsearch: boolean;
}

export interface SlackStatus {
  isConnected: boolean;
  teamId?: string;
  teamName?: string;
  channelId?: string;
  connectedAt?: string;
}

export interface CampaignRecipient {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  status: string;
}

export interface Campaign {
  id: string;
  userId: string;
  senderId?: string | null;
  name: string;
  subject: string;
  body: string;
  status: 'DRAFT' | 'SCHEDULED' | 'QUEUED' | 'SENDING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  recipients?: CampaignRecipient[];
}

export interface ListCampaignsResponse {
  campaigns: Campaign[];
  total: number;
}

export interface AnalyticsOverview {
  totalEmails: number;
  sentEmails: number;
  failedEmails: number;
  pendingEmails: number;
  successRate: number;
  activeCampaigns: number;
  totalSenders: number;
  recentActivity: Array<{
    id: string;
    recipient: string;
    subject: string;
    status: string;
    updatedAt: string;
  }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errBody = await response.json();
      if (errBody.error) errorMsg = errBody.error;
    } catch {}
    throw new Error(errorMsg);
  }

  return response.json();
}

export const apiClient = {
  // Auth: Returns User object on 200 OK, or null cleanly on 401 Unauthorized
  getMe: async (): Promise<User | null> => {
    try {
      const url = `${API_BASE}/auth/me`;
      const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 401) {
        return null;
      }
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.user || data;
    } catch {
      return null;
    }
  },

  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),

  // Emails & Scheduling
  scheduleEmails: (data: ScheduleRequest) =>
    request<ScheduleResponse>('/emails/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listEmailJobs: (params: { page?: number; limit?: number; status?: string; recipient?: string; subject?: string }) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));
    if (params.status) query.append('status', params.status);
    if (params.recipient) query.append('recipient', params.recipient);
    if (params.subject) query.append('subject', params.subject);
    return request<ListEmailJobsResponse>(`/emails?${query.toString()}`);
  },

  searchEmailJobs: (q: string, page = 1, limit = 20) =>
    request<SearchResponse>(`/emails/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`),

  // Campaigns
  listCampaigns: (status?: string) => {
    const query = status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : '';
    return request<ListCampaignsResponse>(`/campaigns${query}`);
  },

  getCampaign: (id: string) => request<Campaign>(`/campaigns/${id}`),

  createCampaign: (data: { name: string; subject: string; body: string; senderId?: string; scheduledAt?: string }) =>
    request<Campaign>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCampaign: (id: string, data: Partial<{ name: string; subject: string; body: string; senderId?: string; scheduledAt?: string }>) =>
    request<Campaign>(`/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteCampaign: (id: string) => request<{ success: boolean; message: string }>(`/campaigns/${id}`, { method: 'DELETE' }),

  addRecipients: (campaignId: string, recipients: Array<{ email: string; firstName?: string; lastName?: string; company?: string }>) =>
    request<{ success: boolean; count: number; recipients: CampaignRecipient[] }>(`/campaigns/${campaignId}/recipients`, {
      method: 'POST',
      body: JSON.stringify({ recipients }),
    }),

  launchCampaign: (id: string) => request<{ message: string; campaign: Campaign }>(`/campaigns/${id}/launch`, { method: 'POST' }),

  cancelCampaign: (id: string) => request<Campaign>(`/campaigns/${id}/cancel`, { method: 'POST' }),

  // Analytics
  getAnalyticsOverview: () => request<AnalyticsOverview>('/analytics/overview'),
  getCampaignAnalytics: (id: string) => request<any>(`/analytics/campaigns/${id}`),

  // Senders
  getSenders: () => request<Sender[]>('/senders'),

  // Slack Integration
  getSlackStatus: () => request<SlackStatus>('/integrations/slack/status'),
  disconnectSlack: () => request<{ message: string }>('/integrations/slack/disconnect', { method: 'POST' }),
};
