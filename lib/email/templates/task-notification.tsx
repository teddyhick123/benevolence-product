// lib/email/templates/task-notification.tsx
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

interface TaskNotificationEmailProps {
  appName: string;
  orgName: string;
  supportEmail: string;
  subject: string;
  preheader: string;
  title: string;
  body: string;
  taskHref: string;
  ctaLabel: string;
  reason: string;
  preferencesHref: string;
}

export default function TaskNotificationEmail({
  appName,
  orgName,
  supportEmail,
  subject,
  preheader,
  title,
  body,
  taskHref,
  ctaLabel,
  reason,
  preferencesHref,
}: TaskNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{preheader}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="max-w-xl mx-auto py-8 px-4">
            <Section className="bg-white rounded-xl p-8 shadow-sm">
              <Text className="text-xs text-gray-400 uppercase tracking-wide mb-4">{orgName}</Text>
              <Text className="text-xl font-semibold text-gray-800 mt-0 mb-2">{title}</Text>
              <Text className="text-gray-600 text-sm leading-relaxed mb-6">{body}</Text>
              <Button
                href={taskHref}
                className="bg-blue-600 text-white rounded-lg px-5 py-3 text-sm font-medium no-underline"
              >
                {ctaLabel}
              </Button>
              <Hr className="my-6 border-gray-100" />
              <Text className="text-xs text-gray-400">
                {reason} · Sent from {appName} for {orgName}
              </Text>
            </Section>
            <Text className="text-center text-xs text-gray-400 mt-4">
              <a href={preferencesHref} className="text-gray-400 underline">
                Manage notification preferences
              </a>
              {' · '}
              <a href={`mailto:${supportEmail}`} className="text-gray-400 underline">
                {supportEmail}
              </a>
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

TaskNotificationEmail.PreviewProps = {
  appName: 'Platform',
  orgName: 'Acme Foundation',
  supportEmail: 'support@example.com',
  subject: 'Task assigned: Submit quarterly grant report',
  preheader: 'A task has been assigned to you. Due: May 22.',
  title: 'Task assigned: Submit quarterly grant report',
  body: 'A task has been assigned to you. Due: May 22, 2026.',
  taskHref: 'https://example.com/dashboard/tasks?task=abc',
  ctaLabel: 'View Task',
  reason: 'You were assigned this task',
  preferencesHref: 'https://example.com/settings/notifications',
};
