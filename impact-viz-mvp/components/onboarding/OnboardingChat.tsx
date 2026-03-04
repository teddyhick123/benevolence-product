'use client';

import { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, SparklesIcon } from '@heroicons/react/24/outline';
import ReactMarkdown from 'react-markdown';
import ProgressIndicator from './ProgressIndicator';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ConversationState {
  topics_covered: string[];
  confidence_scores: {
    pain_points: number;
    goals: number;
    workflows: number;
    team: number;
  };
  message_count: number;
  ready_for_recommendations: boolean;
}

interface OnboardingChatProps {
  sessionId: string;
  initialMessages?: Message[];
  initialState?: ConversationState;
  onReadyForRecommendations: () => void;
}

export default function OnboardingChat({
  sessionId,
  initialMessages = [],
  initialState,
  onReadyForRecommendations,
}: OnboardingChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState>(
    initialState || {
      topics_covered: [],
      confidence_scores: { pain_points: 0, goals: 0, workflows: 0, team: 0 },
      message_count: 0,
      ready_for_recommendations: false,
    }
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: input.trim(),
        }),
      });

      const data = await res.json();
      console.log('Chat API response:', data);

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      if (data.message) {
        console.log('Adding assistant message:', data.message);
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.message,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }

      if (data.conversation_state) {
        setConversationState(data.conversation_state);
      }

      if (data.ready_for_recommendations) {
        onReadyForRecommendations();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `I'm sorry, I encountered an error: ${errorMessage}. Could you try again?`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-full gap-6">
      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-200 bg-gradient-to-r from-azure/5 to-transparent">
          <div className="w-10 h-10 bg-azure rounded-full flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">Chat with Ben</h2>
            <p className="text-xs text-neutral-500">Your onboarding assistant</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-azure text-white rounded-br-md'
                    : 'bg-neutral-100 text-neutral-900 rounded-bl-md'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm prose-neutral max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-neutral-100 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-neutral-200 p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                rows={1}
                className="w-full px-4 py-3 pr-12 rounded-xl border border-neutral-200 focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/20 resize-none"
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="p-3 bg-azure text-white rounded-xl hover:bg-azure/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-neutral-400 mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* Sidebar with progress */}
      <div className="w-72 flex-shrink-0">
        <ProgressIndicator conversationState={conversationState} />

        {/* Quick tips */}
        <div className="mt-4 bg-azure/5 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-neutral-900 mb-2">Tips</h4>
          <ul className="text-xs text-neutral-600 space-y-2">
            <li>Share what takes up most of your time</li>
            <li>Mention any frustrations or challenges</li>
            <li>Describe your goals for the next year</li>
            <li>Tell Ben about your team</li>
          </ul>
        </div>

        {/* Skip to recommendations */}
        {conversationState.message_count >= 3 && (
          <button
            onClick={onReadyForRecommendations}
            className="mt-4 w-full px-4 py-2 text-sm text-azure border border-azure rounded-lg hover:bg-azure/5 transition-colors"
          >
            Skip to recommendations
          </button>
        )}
      </div>
    </div>
  );
}
