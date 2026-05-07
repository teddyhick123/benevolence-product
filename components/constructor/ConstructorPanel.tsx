'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import TrefoilLoader from '@/components/TrefoilLoader';
import type { ConstructorSSEEvent } from '@/app/api/constructor/chat/route';

type ToolCard = {
  toolUseId: string;
  name: string;
  status: 'running' | 'done';
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  tools?: ToolCard[];
};

function toolIcon(name: string): string {
  if (name === 'Write' || name === 'Edit') return '✏️';
  if (name === 'Bash') return '⚡';
  return '📄';
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function ToolCardRow({ tool }: { tool: ToolCard }) {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500 py-0.5">
      <span>{toolIcon(tool.name)}</span>
      <span className="font-mono text-neutral-700 w-16 shrink-0">{tool.name}</span>
      {tool.status === 'running' ? (
        <span className="text-azure">
          <TrefoilLoader className="h-3 w-3 inline-block" />
        </span>
      ) : (
        <span className="text-green-600">✓</span>
      )}
    </div>
  );
}

export default function ConstructorPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Welcome to Constructor — your AI coding assistant. Describe what you want to build and I'll read the codebase, make the changes, and verify them. I already know this project's conventions from CLAUDE.md.",
    },
  ]);
  const [currentText, setCurrentText] = useState('');
  const [activeTools, setActiveTools] = useState<ToolCard[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentText, activeTools]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsStreaming(true);
    setCurrentText('');
    setActiveTools([]);

    // Mutable refs for closure
    let pendingTools: ToolCard[] = [];
    let fullText = '';

    try {
      const res = await fetch('/api/constructor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, sessionId }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.error}` }]);
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: ConstructorSSEEvent;
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === 'session') {
            setSessionId(event.sessionId);

          } else if (event.type === 'text') {
            fullText += event.delta;
            setCurrentText(t => t + event.delta);

          } else if (event.type === 'tool_start') {
            const card: ToolCard = { toolUseId: event.toolUseId, name: event.name, status: 'running' };
            pendingTools = [...pendingTools, card];
            setActiveTools([...pendingTools]);

          } else if (event.type === 'tool_end') {
            // Find the most recent running card with this toolUseId
            let found = false;
            pendingTools = [...pendingTools].reverse().map(t => {
              if (!found && t.toolUseId === event.toolUseId && t.status === 'running') {
                found = true;
                return { ...t, status: 'done' as const };
              }
              return t;
            }).reverse();
            setActiveTools([...pendingTools]);

          } else if (event.type === 'done') {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: fullText,
              tools: pendingTools.length > 0 ? pendingTools : undefined,
            }]);
            setCurrentText('');
            setActiveTools([]);
            setIsStreaming(false);

          } else if (event.type === 'error') {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `There was an error: ${event.message}`,
            }]);
            setCurrentText('');
            setActiveTools([]);
            setIsStreaming(false);
          }
        }
      }

      // Stream ended without a 'done' event — finalize what we have
      if (fullText || pendingTools.length > 0) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.content === fullText) return prev;
          return [...prev, {
            role: 'assistant',
            content: fullText,
            tools: pendingTools.length > 0 ? pendingTools : undefined,
          }];
        });
        setCurrentText('');
        setActiveTools([]);
        setIsStreaming(false);
      }

    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
      setCurrentText('');
      setActiveTools([]);
      setIsStreaming(false);
    }
  }, [input, isStreaming, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-azure text-white rounded-br-sm'
                  : 'bg-white border border-black/8 shadow-soft rounded-bl-sm'
              }`}
            >
              {/* Tool cards for this message */}
              {msg.tools && msg.tools.length > 0 && (
                <div className="mb-2 pb-2 border-b border-black/8 space-y-0.5">
                  {msg.tools.map(tool => (
                    <ToolCardRow key={tool.toolUseId} tool={tool} />
                  ))}
                </div>
              )}
              <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert' : ''}`}>
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {/* Streaming assistant message */}
        {(isStreaming || currentText || activeTools.length > 0) && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm bg-white border border-black/8 shadow-soft">
              {/* Live tool cards */}
              {activeTools.length > 0 && (
                <div className={`${currentText ? 'mb-2 pb-2 border-b border-black/8' : ''} space-y-0.5`}>
                  {activeTools.map(tool => (
                    <ToolCardRow key={tool.toolUseId} tool={tool} />
                  ))}
                </div>
              )}
              {/* Streaming text */}
              {currentText ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{currentText}</ReactMarkdown>
                </div>
              ) : (
                <span className="text-azure">
                  <TrefoilLoader className="h-4 w-4 inline-block" />
                </span>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-black/8 bg-white px-4 py-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Describe what you want to build…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ maxHeight: '160px', overflowY: 'auto' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
          />
          <button
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm font-medium shadow-soft hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {isStreaming ? <TrefoilLoader className="h-4 w-4" /> : 'Send'}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-neutral-400">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
