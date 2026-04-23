'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { OrgType } from '@/lib/types/org';

// ── Types ─────────────────────────────────────────────────────────────────────

type BubbleKind = 'bot' | 'user' | 'help';
interface Message { id: string; kind: BubbleKind; text: string; }
type WizardStep = 'org_name' | 'org_type' | 'ein' | 'ein_input' | 'modules' | 'provisioning' | 'done';

const MODULES = [
  { key: 'tax',         label: 'Tax Center' },
  { key: 'donors',      label: 'Donor CRM' },
  { key: 'compliance',  label: 'Compliance' },
  { key: 'quickbooks',  label: 'QuickBooks' },
] as const;
type ModuleKey = typeof MODULES[number]['key'];

const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: 'private_foundation',   label: 'Family Foundation' },
  { value: 'daf_sponsor',          label: 'Donor-Advised Fund' },
  { value: 'community_foundation', label: 'Community Foundation' },
  { value: 'nonprofit',            label: 'Nonprofit' },
  { value: 'individual',           label: 'Individual' },
];

const MODULE_DEFAULTS: Record<string, Record<ModuleKey, boolean>> = {
  private_foundation:   { tax: true,  donors: false, compliance: false, quickbooks: false },
  family_office:        { tax: true,  donors: false, compliance: false, quickbooks: true  },
  daf_sponsor:          { tax: true,  donors: false, compliance: false, quickbooks: false },
  community_foundation: { tax: false, donors: true,  compliance: true,  quickbooks: false },
  nonprofit:            { tax: false, donors: true,  compliance: true,  quickbooks: false },
  corporation:          { tax: true,  donors: false, compliance: false, quickbooks: true  },
  individual:           { tax: true,  donors: false, compliance: false, quickbooks: false },
};

function uid() { return Math.random().toString(36).slice(2); }

// ── Sub-components ────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Message }) {
  if (msg.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-azure text-white text-sm leading-relaxed px-4 py-2.5 max-w-[82%]"
          style={{ borderRadius: '12px 0 12px 12px' }}>
          {msg.text}
        </div>
      </div>
    );
  }
  if (msg.kind === 'help') {
    return (
      <div className="flex gap-3 items-start">
        <Avatar />
        <div className="text-sm leading-relaxed px-4 py-2.5 max-w-[82%] italic"
          style={{ background: '#f0f7fb', border: '1px solid var(--color-azure-soft, #b8d0df)', borderRadius: '0 12px 12px 12px', color: 'var(--color-azure-deep, #2f5c7a)', fontFamily: 'var(--font-serif)' }}>
          {msg.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 items-start">
      <Avatar />
      <div className="bg-creme-warm text-ink text-sm leading-relaxed px-4 py-2.5 max-w-[82%]"
        style={{ borderRadius: '0 12px 12px 12px' }}>
        {msg.text}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-azure text-white flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{ fontFamily: 'var(--font-serif)', fontSize: '0.875rem', fontWeight: 600 }}>
      B.
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SetupClient() {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([
    { id: uid(), kind: 'bot', text: "Welcome to Benevolence. I'll help you set up your workspace in about 2 minutes. What's the name of your organization?" },
  ]);
  const [step, setStep] = useState<WizardStep>('org_name');
  const [inputValue, setInputValue] = useState('');

  // Collected answers
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<OrgType | null>(null);
  const [ein, setEin] = useState('');
  const [einSkipped, setEinSkipped] = useState(false);
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>({ tax: false, donors: false, compliance: false, quickbooks: false });
  const [loadingHelp, setLoadingHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function addMessage(kind: BubbleKind, text: string) {
    setMessages(prev => [...prev, { id: uid(), kind, text }]);
  }

  // ── Step handlers ──────────────────────────────────────────────────────────

  function handleOrgNameSubmit() {
    const name = inputValue.trim();
    if (!name) return;
    setOrgName(name);
    setInputValue('');
    addMessage('user', name);
    setTimeout(() => {
      addMessage('bot', `What type of organization is ${name}?`);
      setStep('org_type');
    }, 300);
  }

  function handleOrgTypeSelect(value: OrgType) {
    const label = ORG_TYPES.find(t => t.value === value)?.label ?? value;
    setOrgType(value);
    addMessage('user', label);
    setModules(MODULE_DEFAULTS[value] ?? { tax: false, donors: false, compliance: false, quickbooks: false });
    setTimeout(() => {
      addMessage('bot', 'Do you have an EIN (Employer Identification Number)? This unlocks charity verification and tax features — you can always add it later.');
      setStep('ein');
    }, 300);
  }

  async function handleHelpMeDecide() {
    setLoadingHelp(true);
    addMessage('bot', 'Let me explain the differences…');
    try {
      const res = await fetch('/api/onboarding/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'org_type_help', context: { org_name: orgName } }),
      });
      const data = await res.json();
      if (res.ok && data.answer) {
        addMessage('help', data.answer);
      }
    } catch {
      // Silently fall through — user can still pick from chips
    } finally {
      setLoadingHelp(false);
    }
  }

  async function handleModuleHelp(moduleKey: ModuleKey) {
    if (!orgType) return;
    setLoadingHelp(true);
    try {
      const res = await fetch('/api/onboarding/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'module_help',
          context: { org_name: orgName, org_type: orgType, module: moduleKey },
        }),
      });
      const data = await res.json();
      if (res.ok && data.answer) {
        addMessage('help', data.answer);
      }
    } catch {
      // Silently fall through
    } finally {
      setLoadingHelp(false);
    }
  }

  function handleEinSubmit(skip: boolean) {
    if (skip) {
      setEinSkipped(true);
      addMessage('user', 'Skip for now');
    } else {
      const val = inputValue.trim();
      if (!/^\d{2}-\d{7}$/.test(val)) {
        setError('Please enter a valid EIN in the format XX-XXXXXXX, or skip for now.');
        return;
      }
      setEin(val);
      setInputValue('');
      addMessage('user', val);
    }
    setError(null);
    setTimeout(() => {
      const orgLabel = ORG_TYPES.find(t => t.value === orgType)?.label ?? orgType;
      addMessage('bot', `Based on ${orgLabel}, I've turned on the features most relevant to you. Tap any to learn more or toggle off.`);
      setStep('modules');
    }, 300);
  }

  function toggleModule(key: ModuleKey) {
    setModules(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleProvision() {
    setStep('provisioning');
    addMessage('bot', `All set. Creating your ${orgName} workspace now…`);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName,
          org_type: orgType,
          ein: einSkipped ? undefined : ein || undefined,
          modules,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setStep('modules');
        return;
      }
      setStep('done');
      const dest = data.portfolio_id
        ? `/dashboard?portfolio_id=${encodeURIComponent(data.portfolio_id)}`
        : '/dashboard';
      router.replace(dest);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setStep('modules');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const chipClass = 'text-xs font-medium px-3 py-1.5 rounded-full border transition-colors cursor-pointer select-none';
  const chipDefault = 'bg-white border-azure-soft text-azure-deep hover:bg-[#f0f7fb]';
  const chipSelected = 'bg-azure border-azure text-white';
  const chipHelp = 'bg-white border-ink-10 text-ink-60 italic hover:border-azure-soft';

  return (
    <div className="min-h-screen bg-creme flex flex-col font-sans antialiased">

      {/* Nav */}
      <nav className="flex items-center justify-between px-14 py-5 border-b border-ink-10">
        <Link href="/" style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-azure-deep)' }}>
          Benevolence<span style={{ color: 'var(--color-coral)' }}>.</span>
        </Link>
        <span className="text-xs text-ink-30 tracking-wide font-medium uppercase">Setting up your workspace</span>
      </nav>

      {/* Chat thread */}
      <div className="flex-1 flex justify-center py-10 px-4 overflow-y-auto">
        <div className="w-full max-w-lg flex flex-col gap-4">

          {messages.map(msg => <Bubble key={msg.id} msg={msg} />)}

          {/* Step: org_type — chips */}
          {step === 'org_type' && (
            <div className="flex flex-wrap gap-2 pl-11">
              {ORG_TYPES.map(t => (
                <button key={t.value} onClick={() => handleOrgTypeSelect(t.value)}
                  className={`${chipClass} ${chipDefault}`}>
                  {t.label}
                </button>
              ))}
              <button onClick={handleHelpMeDecide} disabled={loadingHelp}
                className={`${chipClass} ${chipHelp}`}>
                {loadingHelp ? '…' : '✦ Help me decide'}
              </button>
            </div>
          )}

          {/* Step: ein — two choices */}
          {step === 'ein' && (
            <div className="pl-11 flex gap-2 flex-wrap">
              <button onClick={() => setStep('ein_input')}
                className={`${chipClass} ${chipDefault}`}>
                Yes, I have it
              </button>
              <button onClick={() => handleEinSubmit(true)}
                className={`${chipClass} ${chipDefault}`}>
                Skip for now
              </button>
            </div>
          )}

          {/* Step: ein_input — text field */}
          {step === 'ein_input' && (
            <div className="pl-11 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="12-3456789"
                  value={inputValue}
                  onChange={e => { setInputValue(e.target.value); setError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleEinSubmit(false); }}
                  className="border border-ink-10 rounded-full px-4 py-1.5 text-sm focus:outline-none focus:border-azure-soft bg-white"
                  style={{ width: '160px' }}
                  autoFocus
                />
                <button onClick={() => handleEinSubmit(false)}
                  className="bg-azure text-white text-xs font-semibold px-4 py-1.5 rounded-full hover:bg-azure-deep transition-colors">
                  Continue →
                </button>
              </div>
              {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
            </div>
          )}

          {/* Step: modules */}
          {step === 'modules' && (
            <div className="pl-11 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 max-w-xs" id="module-grid">
                {MODULES.map(m => (
                  <div key={m.key} className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleModule(m.key)}
                      className={`${chipClass} flex items-center gap-1.5 ${modules[m.key] ? chipSelected : chipDefault}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${modules[m.key] ? 'bg-white' : 'bg-azure-soft'}`} />
                      {m.label}
                    </button>
                    <button
                      onClick={() => handleModuleHelp(m.key)}
                      disabled={loadingHelp}
                      className="text-ink-30 hover:text-azure text-xs leading-none"
                      title={`What is ${m.label}?`}>
                      ?
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={handleProvision}
                  className="bg-azure text-white text-xs font-semibold px-5 py-2 rounded-full hover:bg-azure-deep transition-colors">
                  Looks good →
                </button>
                <button
                  onClick={() => document.getElementById('module-grid')?.scrollIntoView({ behavior: 'smooth' })}
                  className="bg-white text-azure border border-azure-soft text-xs font-semibold px-5 py-2 rounded-full hover:bg-[#f0f7fb] transition-colors">
                  Customize
                </button>
              </div>
              {error && <p className="text-xs text-rose-600 mt-1" role="alert">{error}</p>}
            </div>
          )}

          {/* Step: provisioning spinner */}
          {step === 'provisioning' && (
            <div className="pl-11">
              <div className="w-4 h-4 border-2 border-azure border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar — only shown during org_name step */}
      {step === 'org_name' && (
        <div className="border-t border-ink-10 px-4 py-4 flex justify-center">
          <div className="w-full max-w-lg flex gap-2">
            <input
              type="text"
              placeholder="Your organization name…"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleOrgNameSubmit(); }}
              className="flex-1 border border-ink-10 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-azure-soft bg-white"
              autoFocus
            />
            <button
              onClick={handleOrgNameSubmit}
              disabled={!inputValue.trim()}
              className="bg-azure text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-azure-deep transition-colors disabled:opacity-50">
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
