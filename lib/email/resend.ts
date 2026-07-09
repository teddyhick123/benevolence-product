// lib/email/resend.ts
import { Resend } from 'resend';
import { render } from '@react-email/components';
import InviteEmail from './templates/invite';
import { branding } from '@/lib/config';

export interface SendInviteEmailParams {
  to: string;
  orgName: string;
  inviterName: string;
  role: string;
  message?: string | null;
  acceptUrl: string;
}

function createResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(apiKey);
}

export async function sendInviteEmail(params: SendInviteEmailParams): Promise<void> {
  const { to, orgName, inviterName, role, message, acceptUrl } = params;

  const html = await render(
    InviteEmail({ orgName, inviterName, role, message: message ?? undefined, acceptUrl })
  );

  const { error } = await createResendClient().emails.send({
    from: `${branding.appName} <noreply@${process.env.RESEND_FROM_DOMAIN || 'resend.dev'}>`,
    to,
    subject: `You've been invited to join ${orgName} on ${branding.appName}`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
