'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowPathIcon, ChatBubbleLeftRightIcon, XMarkIcon, MicrophoneIcon, StopIcon } from '@heroicons/react/24/outline';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import TrefoilLoader from './TrefoilLoader';
import InlineWidget from './InlineWidget';
import ReactMarkdown from 'react-markdown';

type ContentBlock = {
  type: 'text' | 'chart';
  content?: string;
  widget?: any;
};

type WidgetData = {
  id: string;
  portfolio_id?: string;
  holding_id?: string;
  type: string;
  title: string | null;
  config: any | null;
  is_preview?: boolean;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  content_blocks?: ContentBlock[];
  widgets?: WidgetData[];
};

type AIAction = {
  id: string;
  actionType: string;
  entityType: string;
  aiReasoning?: string;
  status: string;
  createdAt: string;
};

type Props = {
  portfolioId: string;
  onClose?: () => void;
};

export default function AIAssistantPanel({ portfolioId, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recentActions, setRecentActions] = useState<AIAction[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Audio recording
  const { state: recordingState, error: recordingError, startRecording, stopRecording, cancelRecording } = useAudioRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load conversation history on mount
  useEffect(() => {
    loadHistory();
    loadActions();
  }, [portfolioId]);

  // Add welcome message if no messages exist
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: `Hi! I'm Ben, your AI portfolio assistant. I can help you manage your portfolio through natural conversation.

Here's what I can do:
• Add, update, or remove holdings
• Create KPI metrics and track performance
• Build visualization widgets
• Add geographic locations to your holdings
• Answer questions about your portfolio

Just ask me anything, and I'll help you out! If you don't like a change I make, you can easily undo it.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, []);

  const loadHistory = async () => {
    try {
      const res = await fetch(`/api/ai/chat?portfolioId=${portfolioId}`);
      const data = await res.json();
      if (data.session) {
        setSessionId(data.session.id);
        setMessages(data.messages || []);
      }
    } catch (err) {
      // Failed to load conversation history
    }
  };

  const loadActions = async () => {
    try {
      const res = await fetch(`/api/ai/undo?portfolioId=${portfolioId}&limit=10`);
      const data = await res.json();
      setRecentActions(data.actions || []);
    } catch (err) {
      // Failed to load actions
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId,
          message: input,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      if (data.message) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.message,
          timestamp: new Date().toISOString(),
          content_blocks: data.content_blocks,
          widgets: data.widgets,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }

      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      // Reload actions if any were created
      if (data.actions && data.actions.length > 0) {
        loadActions();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errorMessage}. Please try again.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const undoAction = async (actionId: string) => {
    try {
      const res = await fetch('/api/ai/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId }),
      });

      if (res.ok) {
        loadActions();
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Action undone successfully.',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      // Undo action failed
    }
  };

  const redoAction = async (actionId: string) => {
    try {
      const res = await fetch('/api/ai/redo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId }),
      });

      if (res.ok) {
        loadActions();
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Action redone successfully.',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      // Redo action failed
    }
  };

  const toggleRecording = async () => {
    if (recordingState === 'recording') {
      // Stop recording and transcribe
      try {
        setIsTranscribing(true);
        const audioBlob = await stopRecording();

        // Send to Whisper API
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        const res = await fetch('/api/ai/transcribe', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (data.text) {
          setInput(data.text);
        }
      } catch (err) {
        // Transcription failed
      } finally {
        setIsTranscribing(false);
      }
    } else {
      // Start recording
      startRecording();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white shadow-xl rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-azure text-white">
        <div className="flex items-center gap-2">
          <ChatBubbleLeftRightIcon className="h-5 w-5" />
          <h2 className="font-semibold">Ben - AI Assistant</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            {/* Main message bubble */}
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 text-neutral-900'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="text-sm prose prose-sm prose-neutral max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
              <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-neutral-500'}`}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </p>
            </div>

            {/* Render content_blocks if present (new structured report format) */}
            {msg.content_blocks && msg.content_blocks.length > 0 && (
              <div className="w-full mt-2 space-y-2">
                {msg.content_blocks.map((block, blockIdx) => (
                  <div key={`block-${idx}-${blockIdx}`}>
                    {block.type === 'text' && block.content && (
                      <div className="bg-neutral-50 rounded-lg px-4 py-2 text-sm prose prose-sm prose-neutral max-w-none">
                        <ReactMarkdown>{block.content}</ReactMarkdown>
                      </div>
                    )}
                    {block.type === 'chart' && block.widget && (
                      <InlineWidget widget={block.widget} portfolioId={portfolioId} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Render widgets if present (existing widget format) */}
            {msg.widgets && msg.widgets.length > 0 && !msg.content_blocks && (
              <div className="w-full mt-2 space-y-2">
                {msg.widgets.map((widget, widgetIdx) => (
                  <InlineWidget
                    key={`widget-${idx}-${widgetIdx}`}
                    widget={widget}
                    portfolioId={portfolioId}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 rounded-lg px-4 py-3">
              <TrefoilLoader className="h-6 w-6 text-azure" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Recent Actions */}
      {recentActions.length > 0 && (
        <div className="border-t border-neutral-200 px-4 py-2 bg-neutral-50">
          <p className="text-xs font-semibold text-neutral-700 mb-2">Recent Actions</p>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {recentActions.slice(0, 3).map((action) => (
              <div
                key={action.id}
                className="flex items-center justify-between text-xs bg-white rounded px-2 py-1"
              >
                <div className="flex-1 truncate">
                  <span className="font-medium">{action.actionType}</span>
                  <span className="text-neutral-500 ml-1">{action.entityType}</span>
                </div>
                {action.status === 'applied' && (
                  <button
                    onClick={() => undoAction(action.id)}
                    className="ml-2 text-blue-600 hover:text-blue-700"
                  >
                    Undo
                  </button>
                )}
                {action.status === 'undone' && (
                  <button
                    onClick={() => redoAction(action.id)}
                    className="ml-2 text-green-600 hover:text-green-700"
                  >
                    Redo
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-neutral-200 p-4">
        {recordingError && (
          <div className="mb-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded">
            {recordingError}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isLoading || isTranscribing}
            className={`p-2 rounded-lg transition-colors ${
              recordingState === 'recording'
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={recordingState === 'recording' ? 'Stop recording' : 'Start recording'}
          >
            {recordingState === 'recording' ? (
              <StopIcon className="h-5 w-5" />
            ) : isTranscribing ? (
              <TrefoilLoader className="h-5 w-5 text-azure" />
            ) : (
              <MicrophoneIcon className="h-5 w-5" />
            )}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={recordingState === 'recording' ? 'Recording...' : isTranscribing ? 'Transcribing...' : 'Type or speak your message...'}
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            disabled={isLoading || recordingState === 'recording' || isTranscribing}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || recordingState === 'recording' || isTranscribing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
