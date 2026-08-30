export type InfrastructureHealthStatus = 'healthy' | 'unhealthy' | 'degraded';

export interface HealthCheckResult {
  status: InfrastructureHealthStatus;
  timestamp: string;
  uptime: number;
  services: {
    postgres: { status: InfrastructureHealthStatus; latencyMs?: number; error?: string };
    redis: { status: InfrastructureHealthStatus; latencyMs?: number; error?: string };
    elasticsearch: { status: InfrastructureHealthStatus; latencyMs?: number; error?: string };
  };
}

export enum EmailJobStatus {
  SCHEDULED = 'SCHEDULED',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum DeliveryAttemptStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  QUEUED = 'QUEUED',
  SENDING = 'SENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export enum RecipientStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// Job State Machine Guard Definition
const ALLOWED_JOB_TRANSITIONS: Record<EmailJobStatus, EmailJobStatus[]> = {
  [EmailJobStatus.SCHEDULED]: [EmailJobStatus.PROCESSING, EmailJobStatus.CANCELLED],
  [EmailJobStatus.PROCESSING]: [EmailJobStatus.SENT, EmailJobStatus.FAILED, EmailJobStatus.SCHEDULED],
  [EmailJobStatus.SENT]: [],
  [EmailJobStatus.FAILED]: [EmailJobStatus.SCHEDULED],
  [EmailJobStatus.CANCELLED]: [],
};

export function canTransition(currentStatus: EmailJobStatus, targetStatus: EmailJobStatus): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = ALLOWED_JOB_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

export const canTransitionJob = canTransition;

// Campaign State Machine Guard Definition
const ALLOWED_CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  [CampaignStatus.DRAFT]: [CampaignStatus.SCHEDULED, CampaignStatus.QUEUED, CampaignStatus.CANCELLED],
  [CampaignStatus.SCHEDULED]: [CampaignStatus.QUEUED, CampaignStatus.CANCELLED, CampaignStatus.DRAFT],
  [CampaignStatus.QUEUED]: [CampaignStatus.SENDING, CampaignStatus.CANCELLED, CampaignStatus.FAILED],
  [CampaignStatus.SENDING]: [CampaignStatus.COMPLETED, CampaignStatus.FAILED, CampaignStatus.CANCELLED],
  [CampaignStatus.COMPLETED]: [], // Terminal state
  [CampaignStatus.CANCELLED]: [CampaignStatus.DRAFT], // Re-draft allowed
  [CampaignStatus.FAILED]: [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED], // Retry allowed
};

export function canTransitionCampaign(currentStatus: CampaignStatus, targetStatus: CampaignStatus): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = ALLOWED_CAMPAIGN_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}
