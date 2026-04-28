// lib/email/resend.ts
import { Resend } from 'resend';
import { render } from '@react-email/components';
import InviteEmail from './templates/invite';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendInviteEmailParams {
  to: string;
  orgName: string;
  inviterName: string;
  role: string;
  message?: string | null;
  acceptUrl: string;
}

export async function sendInviteEmail(params: SendInviteEmailParams): Promise<void> {
  const { to, orgName, inviterName, role, message, acceptUrl } = params;

  const html = await render(
    InviteEmail({ orgName, inviterName, role, message: message ?? undefined, acceptUrl })
  );

  const { error } = await resend.emails.send({
    from: `Benevolence <noreply@${process.env.RESEND_FROM_DOMAIN || 'resend.dev'}>`,
    to,
    subject: `You've been invited to join ${orgName} on Benevolence`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
