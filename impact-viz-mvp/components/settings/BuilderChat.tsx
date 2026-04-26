// components/settings/BuilderChat.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { CheckCircle, Clock, FileCode, AlertCircle, Send } from 'lucide-react';

interface TextMessage {
  type: 'text';
  role: 'user' | 'assistant';
  content: string;
}

interface ConfigResultMessage {
  type: 'config_result';
  tool: string;
  message: string;
  success: boolean;
}

interface ProposalMessage {
  type: 'proposal';
  proposalId: string;
  summary: string;
  fileCount: number;
}

type ChatMessage = TextMessage | ConfigResultMessage | ProposalMessage;

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface BuilderChatProps {
  orgId: string;
  initialMessages: StoredMessage[];
}

export default function BuilderChat({ orgId, initialMessages }: BuilderChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages.map(m => ({
      type: 'text' as const,
      role: m.role,
      content: m.content,
    }))
  );
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  async function handleSend() {
    const message = input.trim();
    if (!message || streaming) return;

    setInput('');
    setError(null);
    setStreaming(true);
    setStreamingText('');
    setActiveTools([]);

    setMessages(prev => [...prev, { type: 'text', role: 'user', content: message }]);

    const pendingToolResults: ChatMessage[] = [];

    try {
      const res = await fetch(`/api/org/${orgId}/builder/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Request failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let accText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'text') {
            accText += event.text as string;
            setStreamingText(accText);
          } else if (event.type === 'tool_start') {
            setActiveTools(prev => [...prev, event.tool as string]);
          } else if (event.type === 'tool_result') {
            const result = event.result as { type: string; tool: string; message: string };
            pendingToolResults.push({
              type: 'config_result',
              tool: result.tool,
              message: result.message,
              success: result.type === 'config_success',
            });
            setActiveTools(prev => prev.filter(t => t !== result.tool));
          } else if (event.type === 'proposal') {
            pendingToolResults.push({
              type: 'proposal',
              proposalId: event.proposalId as string,
              summary: event.summary as string,
              fileCount: event.fileCount as number,
            });
          } else if (event.type === 'done') {
            if (accText) {
              setMessages(prev => [
                ...prev,
                ...pendingToolResults,
                { type: 'text', role: 'assistant', content: accText },
              ]);
            } else {
              setMessages(prev => [...prev, ...pendingToolResults]);
            }
            setStreamingText('');
            setActiveTools([]);
          } else if (event.type === 'error') {
            throw new Error(event.message as string);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      setStreamingText('');
      setActiveTools([]);
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.length === 0 && !streaming && (
          <div className="text-center text-black/40 text-sm mt-8">
            <p className="font-medium mb-1">Welcome to Builder</p>
            <p>Ask me to customize your instance — add a metric, adjust branding, or build a new feature.</p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.type === 'text') {
            return (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-azure text-white'
                      : 'bg-white border border-black/10 text-black/80'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            );
          }

          if (msg.type === 'config_result') {
            return (
              <div key={i} className="flex justify-start">
                <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm max-w-[85%] border ${
                  msg.success
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {msg.success
                    ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  }
                  <span>{msg.message}</span>
                </div>
              </div>
            );
          }

          if (msg.type === 'proposal') {
            return (
              <div key={i} className="flex justify-start">
                <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm max-w-[85%] border border-blue-200 bg-blue-50 text-blue-900">
                  <FileCode className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{msg.summary}</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {msg.fileCount} file{msg.fileCount !== 1 ? 's' : ''} · In review
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1 text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded px-2 py-0.5">
                      <Clock className="w-3 h-3" /> Pending review
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })}

        {/* Active tool indicators */}
        {activeTools.map(tool => (
          <div key={tool} className="flex justify-start">
            <div className="text-xs text-black/40 italic px-2">
              Running {tool.replace(/_/g, ' ')}…
            </div>
          </div>
        ))}

        {/* Streaming text */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap bg-white border border-black/10 text-black/80">
              {streamingText}
              <span className="inline-block w-1.5 h-3 bg-black/30 animate-pulse ml-0.5" />
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-black/10 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Builder to customize your instance…"
            disabled={streaming}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/40 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="self-end px-3 py-2 bg-azure text-white rounded-lg hover:bg-azure/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-black/30 mt-1.5 ml-1">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
