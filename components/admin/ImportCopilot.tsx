'use client';

import { apiRequest, readJson, requestStream } from "@/lib/api/client";
// components/admin/ImportCopilot.tsx
// AI Migration Copilot chat panel

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ChatAction, ChatMessage } from '@/lib/import/ai/chat';

interface ImportCopilotProps {
  importJobId: string;
  initialStatus: string;
}

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: ChatAction[];
  streaming?: boolean;
}

const STARTER_PROMPTS = [
  'Why did rows fail?',
  'How do I fix EIN errors?',
  'Is my data ready to load?',
];

export function ImportCopilot({ importJobId, initialStatus }: ImportCopilotProps) {
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm your Migration Copilot. I can help you understand errors, suggest fixes, and guide you through the import process. What would you like to know?",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;

      const userMsg: DisplayMessage = { role: 'user', content: text };
      const history: ChatMessage[] = messages
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);

      // Add empty streaming assistant message
      const assistantIdx = messages.length + 1;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '', streaming: true },
      ]);

      try {
        const res = await requestStream(`/api/admin/imports/${importJobId}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history }),
        });

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let collectedActions: ChatAction[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string;
                text?: string;
                actions?: ChatAction[];
                message?: string;
              };

              if (event.type === 'chunk' && event.text) {
                fullText += event.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: fullText,
                    streaming: true,
                  };
                  return updated;
                });
              } else if (event.type === 'actions' && event.actions) {
                collectedActions = event.actions;
              } else if (event.type === 'done') {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: fullText,
                    actions: collectedActions.length > 0 ? collectedActions : undefined,
                    streaming: false,
                  };
                  return updated;
                });
              } else if (event.type === 'error') {
                throw new Error(event.message ?? 'Stream error');
              }
            } catch {
              // skip malformed events
            }
          }
        }
      } catch (err) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `Sorry, I encountered an error: ${err instanceof Error ? err.message : 'Unknown error'}`,
            streaming: false,
          };
          return updated;
        });
      } finally {
        setSending(false);
        // Suppress unused variable warning
        void assistantIdx;
      }
    },
    [importJobId, messages, sending]
  );

  const handleAction = useCallback(
    async (action: ChatAction) => {
      setActionFeedback(null);
      try {
        switch (action.type) {
          case 'bulk_fix': {
            const res = await apiRequest(`/api/admin/imports/${importJobId}/bulk-fix`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity: action.entity,
                field: action.field,
                fix: action.fix,
              }),
            });
            const data = await readJson(res) as { fixed?: number; still_failing?: number };
            setActionFeedback(
              `Fixed ${data.fixed ?? 0} rows. ${data.still_failing ?? 0} still failing.`
            );
            break;
          }

          case 'export_failed': {
            window.open(
              `/api/admin/imports/${importJobId}/errors?format=csv`,
              '_blank'
            );
            break;
          }

          case 'rollback': {
            await apiRequest(`/api/admin/imports/${importJobId}/rollback`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scope: action.scope ?? 'full' }),
            });
            setActionFeedback('Rollback initiated.');
            router.refresh();
            break;
          }

          case 'commit': {
            await apiRequest(`/api/admin/imports/${importJobId}/commit`, {
              method: 'POST',
            });
            setActionFeedback('Import committed.');
            router.refresh();
            break;
          }

          case 'skip_warnings': {
            const res = await apiRequest(`/api/admin/imports/${importJobId}/skip-warnings`, {
              method: 'POST',
            });
            const data = await readJson(res) as { updated?: number };
            setActionFeedback(`Marked ${data.updated ?? 0} warning rows as valid.`);
            break;
          }

          case 'view_errors': {
            const hash = action.filter
              ? `#errors?filter=${encodeURIComponent(String(action.filter))}`
              : '#errors';
            window.location.hash = hash;
            break;
          }

          case 'adjust_mapping': {
            router.push(`/admin/imports/${importJobId}/mapping`);
            break;
          }

          default:
            setActionFeedback(`Action "${action.type}" acknowledged.`);
        }
      } catch {
        setActionFeedback('Action failed. Please try again.');
      }
    },
    [importJobId, router]
  );

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-azure text-white rounded-full shadow-lg hover:bg-azure/90 transition-colors text-sm font-medium"
      >
        <span>AI Copilot</span>
        {sending && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 flex flex-col bg-white border border-neutral-200 rounded-2xl shadow-xl overflow-hidden max-h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-azure text-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Migration Copilot</span>
          {sending && (
            <span className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-white/70 animate-bounce [animation-delay:0ms]" />
              <span className="w-1 h-1 rounded-full bg-white/70 animate-bounce [animation-delay:150ms]" />
              <span className="w-1 h-1 rounded-full bg-white/70 animate-bounce [animation-delay:300ms]" />
            </span>
          )}
        </div>
        <button
          onClick={() => setMinimized(true)}
          className="text-white/70 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
        >
          Minimize
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-azure text-white'
                  : 'bg-neutral-100 text-neutral-800'
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">
                {msg.content}
                {msg.streaming && (
                  <span className="inline-block w-1 h-3 ml-0.5 bg-neutral-400 animate-pulse" />
                )}
              </p>

              {/* Action buttons */}
              {msg.actions && msg.actions.length > 0 && !msg.streaming && (
                <div className="mt-2 pt-2 border-t border-neutral-200 space-y-1">
                  <p className="text-xs text-neutral-500 font-medium mb-1">Suggested Actions</p>
                  {msg.actions.map((action, j) => (
                    <button
                      key={j}
                      onClick={() => handleAction(action)}
                      className="block w-full text-left text-xs px-2 py-1.5 rounded border border-azure/30 text-azure hover:bg-azure/5 transition-colors"
                    >
                      {action.description}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {actionFeedback && (
          <div className="text-xs text-center text-green-700 bg-green-50 rounded px-2 py-1.5 border border-green-200">
            {actionFeedback}
          </div>
        )}

        {/* Starter prompts (shown when only the intro message exists) */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-1.5 justify-center pt-1">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="text-xs px-3 py-1.5 rounded-full border border-azure/30 text-azure hover:bg-azure/5 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-neutral-200 p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder="Ask anything about your import..."
          disabled={sending}
          className="flex-1 text-sm px-3 py-2 border border-neutral-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30 disabled:opacity-50"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={sending || !input.trim()}
          className="px-3 py-2 bg-azure text-white rounded-2xl text-sm hover:bg-azure/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
