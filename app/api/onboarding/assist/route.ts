import { NextRequest } from 'next/server';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { generateOnboardingText } from '@/lib/ai/runtime';
import { branding } from '@/lib/config';

export const dynamic = 'force-dynamic';

const MODULE_LABELS: Record<string, string> = {
  tax: 'Tax Center',
  donors: 'Donor CRM',
  compliance: 'Compliance Calendar',
  quickbooks: 'QuickBooks Sync',
};

const ORG_TYPE_DESCRIPTIONS: Record<string, string> = {
  private_foundation: 'Private Foundation — funded by one family/individual, makes grants from investment returns, files Form 990-PF',
  family_office: 'Family Office — manages investments and giving for a wealthy family, often QB-integrated',
  daf_sponsor: 'DAF Sponsor — manages donor-advised funds, handles many donors recommending grants',
  community_foundation: 'Community Foundation — pools gifts from many donors to serve a geographic region',
  nonprofit: 'Nonprofit — operating charity that raises money and runs programs',
  corporation: "Corporate Giving Program — manages a company's philanthropic activities",
  individual: 'Individual Philanthropist — a single person managing their own giving',
};

type QuestionType = 'org_type_help' | 'module_help';

function buildPrompt(question: QuestionType, context: Record<string, string>): string {
  if (question === 'org_type_help') {
    return `You are the onboarding assistant for ${branding.appName}, a philanthropic portfolio management platform. A new user named "${context.org_name ?? 'the user'}" is setting up their account and isn't sure which organization type applies to them. Explain the differences between the available types in 2-3 plain-English sentences aimed at a foundation executive, then ask which sounds closest. Available types:\n${Object.values(ORG_TYPE_DESCRIPTIONS).join('\n')}`;
  }
  const moduleLabel = MODULE_LABELS[context.module] ?? context.module;
  const orgDesc = ORG_TYPE_DESCRIPTIONS[context.org_type] ?? context.org_type;
  return `You are the onboarding assistant for ${branding.appName}. A user setting up a "${orgDesc}" account wants to know what the "${moduleLabel}" feature does. Explain it in 2 plain-English sentences. Be specific about what it enables and who typically uses it. Do not use jargon.`;
}

export async function POST(req: NextRequest) {
  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access.response;

  try {
    const body = await req.json();
    const { question, context } = body as {
      question: string;
      context: Record<string, string>;
    };

    const validQuestions: QuestionType[] = ['org_type_help', 'module_help'];
    if (!validQuestions.includes(question as QuestionType)) {
      return jsonError(`question must be one of: ${validQuestions.join(', ')}`, 400);
    }

    const prompt = buildPrompt(question as QuestionType, context ?? {});
    const { text: answer } = await generateOnboardingText({
      scope: { kind: 'platform', actorId: access.context.user.id },
      request: {
        maxOutputTokens: 150,
        messages: [{ role: 'user', content: prompt }],
      },
    });

    return jsonOk({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, 500);
  }
}
