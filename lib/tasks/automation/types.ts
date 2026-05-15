// lib/tasks/automation/types.ts

export const TASK_ENTITY_TYPES = [
  'filing',
  'state_registration',
  'pledge_installment',
  'pledge',
  'donor',
  'grant_milestone',
  'grant_report',
  'grant_payment',
  'grant',
  'holding',
  'portfolio',
  'import_job',
  'workflow_instance',
] as const;

export type TaskEntityType = typeof TASK_ENTITY_TYPES[number];

export type TaskProducerResult = {
  producer: string;
  orgId?: string;
  scanned: number;
  created: number;
  updated: number;
  completed: number;
  skipped: number;
  errors: Array<{ sourceType: string; sourceId: string; message: string }>;
};

export type TaskLink = {
  entityType: TaskEntityType;
  entityId: string;
  relationship?: 'primary' | 'context';
};

export type UpsertGeneratedTaskInput = {
  orgId: string;
  portfolioId?: string | null;
  sourceKey: string;
  title: string;
  description: string;
  taskType: 'reminder' | 'follow_up' | 'review' | 'approval';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueAt?: string | null;
  assignedTo?: string | null;
  metadata: {
    producer: string;
    reason: string;
    source_status: string;
    escalation_state?: string;
    generated_at: string;
    [key: string]: unknown;
  };
  links: TaskLink[];
  reopenResolved?: boolean;
};

export type ProducerOptions = {
  orgId?: string;
  sourceType?: string;
  sourceId?: string;
  dryRun?: boolean;
  now?: Date;
};

export type Producer = {
  id: string;
  run: (options: ProducerOptions) => Promise<TaskProducerResult[]>;
};
