// lib/email/templates/task-digest.tsx
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Tailwind,
} from '@react-email/components';
import * as React from 'react';

interface DigestTask {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
}

interface TaskDigestEmailProps {
  appName: string;
  orgName: string;
  supportEmail: string;
  subject: string;
  overdue: DigestTask[];
  dueSoon: DigestTask[];
  approvals: DigestTask[];
  automationFailures: DigestTask[];
  preferencesHref: string;
}

function TaskRow({ task }: { task: DigestTask }) {
  const due = task.due_at ? new Date(task.due_at).toLocaleDateString() : null;
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontWeight: 500, color: '#1f2937' }}>{task.title}</span>
      {due && <span style={{ color: '#9ca3af', fontSize: '12px', marginLeft: '8px' }}>Due {due}</span>}
    </div>
  );
}

export default function TaskDigestEmail({
  appName,
  orgName,
  supportEmail,
  subject,
  overdue,
  dueSoon,
  approvals,
  automationFailures,
  preferencesHref,
}: TaskDigestEmailProps) {
  const itemCount = overdue.length + dueSoon.length + approvals.length + automationFailures.length;
  const previewText = `${itemCount} items need your attention - ${orgName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="max-w-xl mx-auto py-8 px-4">
            <Section className="bg-white rounded-xl p-8 shadow-sm">
              <Text className="text-xs text-gray-400 uppercase tracking-wide mb-4">{orgName}</Text>
              <Text className="text-xl font-semibold text-gray-800 mt-0 mb-1">{subject}</Text>
              <Text className="text-sm text-gray-500 mb-6">Here is your activity digest from {appName}.</Text>

              {overdue.length > 0 && (
                <>
                  <Text className="text-sm font-semibold text-red-600 mb-2">Overdue ({overdue.length})</Text>
                  {overdue.map(t => <TaskRow key={t.id} task={t} />)}
                </>
              )}

              {dueSoon.length > 0 && (
                <>
                  <Text className="text-sm font-semibold text-amber-600 mb-2 mt-4">Due this week ({dueSoon.length})</Text>
                  {dueSoon.map(t => <TaskRow key={t.id} task={t} />)}
                </>
              )}

              {approvals.length > 0 && (
                <>
                  <Text className="text-sm font-semibold text-blue-600 mb-2 mt-4">Approval requests ({approvals.length})</Text>
                  {approvals.map(t => <TaskRow key={t.id} task={t} />)}
                </>
              )}

              {automationFailures.length > 0 && (
                <>
                  <Text className="text-sm font-semibold text-gray-600 mb-2 mt-4">Automation failures ({automationFailures.length})</Text>
                  {automationFailures.map(t => <TaskRow key={t.id} task={t} />)}
                </>
              )}

              <Hr className="my-6 border-gray-100" />
              <Button
                href="/dashboard/tasks"
                className="bg-blue-600 text-white rounded-lg px-5 py-3 text-sm font-medium no-underline"
              >
                View all tasks
              </Button>
            </Section>
            <Text className="text-center text-xs text-gray-400 mt-4">
              <a href={preferencesHref} className="text-gray-400 underline">Manage preferences</a>
              {' · '}
              <a href={`mailto:${supportEmail}`} className="text-gray-400 underline">{supportEmail}</a>
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

TaskDigestEmail.PreviewProps = {
  appName: 'Platform',
  orgName: 'Acme Foundation',
  supportEmail: 'support@example.com',
  subject: '3 tasks need your attention',
  overdue: [{ id: '1', title: 'File Form 990', priority: 'urgent', due_at: '2026-05-01' }],
  dueSoon: [{ id: '2', title: 'Submit grant report', priority: 'high', due_at: '2026-05-22' }],
  approvals: [{ id: '3', title: 'Board meeting minutes', priority: 'normal', due_at: null }],
  automationFailures: [],
  preferencesHref: '/settings/notifications',
};
