// lib/email/templates/invite.tsx
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Preview,
} from '@react-email/components';
import { branding } from '@/lib/config';

interface InviteEmailProps {
  orgName: string;
  inviterName: string;
  role: string;
  message?: string;
  acceptUrl: string;
}

export default function InviteEmail({
  orgName,
  inviterName,
  role,
  message,
  acceptUrl,
}: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{inviterName} invited you to join {orgName} on {branding.appName}</Preview>
      <Body style={{ backgroundColor: '#f5f3ee', fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '480px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Text style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
            You&apos;ve been invited
          </Text>
          <Text style={{ color: '#555', marginBottom: '24px' }}>
            <strong>{inviterName}</strong> has invited you to join <strong>{orgName}</strong> as a <strong>{role}</strong>.
          </Text>

          {message && (
            <Section style={{ backgroundColor: '#f5f3ee', borderRadius: '6px', padding: '16px', marginBottom: '24px' }}>
              <Text style={{ margin: 0, fontStyle: 'italic', color: '#444' }}>
                &ldquo;{message}&rdquo;
              </Text>
            </Section>
          )}

          <Button
            href={acceptUrl}
            style={{
              backgroundColor: '#1a56b0',
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '6px',
              textDecoration: 'none',
              display: 'inline-block',
              fontWeight: '600',
            }}
          >
            Accept invitation
          </Button>

          <Hr style={{ margin: '32px 0', borderColor: '#e5e5e5' }} />
          <Text style={{ fontSize: '12px', color: '#999' }}>
            This invitation expires in 7 days. If you don&apos;t know {inviterName}, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
