'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import InlineWidget from '@/components/InlineWidget';

type PortfolioData = {
  id: string;
  name: string;
  description?: string;
};

type LetterData = {
  letter_content?: string;
  portfolio: {
    id: string;
    name: string;
    description?: string;
  };
  summary: {
    total_holdings: number;
    total_funds_allocated: number;
    total_nav: number;
    generated_at: string;
  };
  kpis: Array<{
    id: string;
    metric_code: string;
    display_name: string;
    latest_value: number | null;
    unit: string | null;
    target_value: number | null;
    target_date: string | null;
  }>;
  holdings: Array<{
    id: string;
    name: string;
    status: string;
    sector: string;
    funds_allocated: number;
  }>;
};

type WidgetData = {
  id: string;
  portfolio_id?: string;
  holding_id?: string;
  type: string;
  title: string | null;
  config: any | null;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  widgets?: WidgetData[];
};

function LetterPageContent() {
  const searchParams = useSearchParams();
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [letterData, setLetterData] = useState<LetterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadPortfolio() {
      try {
        // First check URL params
        const urlPortfolioId = searchParams.get('portfolio_id');
        let portfolioId = urlPortfolioId;

        if (!portfolioId) {
          // Fall back to /api/me
          const res = await fetch('/api/me', { cache: 'no-store' });
          const data = await res.json();

          if (data?.portfolio_id) {
            portfolioId = data.portfolio_id;
          } else {
            // Try to get portfolio from env fallback
            portfolioId = process.env.NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT || '';
          }
        }

        if (portfolioId) {
          // Set portfolio ID immediately for navigation
          setPortfolio({ id: portfolioId, name: '', description: '' });

          // Generate AI letter content
          setGeneratingLetter(true);
          const letterRes = await fetch(`/api/portfolio/${portfolioId}/letter/generate`, {
            method: 'POST',
            cache: 'no-store'
          });
          const letterData = await letterRes.json();

          if (letterRes.ok) {
            setLetterData(letterData);
            setPortfolio({
              id: letterData.portfolio.id,
              name: letterData.portfolio.name,
              description: letterData.portfolio.description,
            });
          }
          setGeneratingLetter(false);
        }
      } catch (error) {
        // Failed to load portfolio data
      } finally {
        setLoading(false);
      }
    }
    loadPortfolio();
  }, [searchParams]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!chatMessage.trim() || isLoadingResponse || !portfolio?.id) return;

    const userMessage: Message = {
      role: 'user',
      content: chatMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setChatMessage('');
    setIsLoadingResponse(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: portfolio.id,
          message: chatMessage,
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
          widgets: data.widgets || [],
        };
        setMessages((prev) => [...prev, assistantMessage]);
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
      setIsLoadingResponse(false);
    }
  };

  if (loading || generatingLetter) {
    return (
      <div className="min-h-screen bg-creme flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-azure/30 border-t-azure rounded-full animate-spin mb-4"></div>
          <p className="text-neutral-800">
            {generatingLetter ? 'Generating your personalized letter with AI...' : 'Preparing your letter...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-creme pb-24">
      {/* Header Navigation */}
      <header className="border-b border-neutral-200 bg-creme/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <a
            href={portfolio?.id ? `/dashboard?portfolio_id=${portfolio.id}` : '/dashboard'}
            className="inline-flex items-center gap-2 text-sm text-neutral-700 hover:text-neutral-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </a>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-creme/80 border border-neutral-300 hover:bg-creme text-sm font-medium text-neutral-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export PDF
          </button>
        </div>
      </header>

      {/* Letter Content */}
      <main className="max-w-3xl mx-auto px-6 py-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        {/* Letter Header */}
        <div className="mb-12 pb-8 border-b border-neutral-200">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="text-sm text-neutral-600 mb-2">Portfolio Letter</div>
              <h1 className="text-4xl font-serif font-bold text-black">{portfolio?.name}</h1>
            </div>
            <div className="text-right text-sm text-neutral-600">
              {new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>
          <div className="w-16 h-1 bg-gradient-to-r from-azure via-azure/90 to-azure/70 rounded-full"></div>
        </div>

        {/* Letter Body - AI Generated Content */}
        <div className="prose prose-lg max-w-none">
          {letterData?.letter_content ? (
            <div className="font-serif text-black leading-relaxed space-y-6 whitespace-pre-wrap">
              {letterData.letter_content}
            </div>
          ) : (
            <div className="font-serif text-black leading-relaxed space-y-6">
              <p className="text-xl font-medium text-neutral-900 mb-8">
                Dear Stakeholder,
              </p>
              <p>
                I am pleased to present this comprehensive overview of your portfolio's performance and impact.
                {letterData?.portfolio.description && ` ${letterData.portfolio.description}`}
              </p>
              <p className="text-sm text-neutral-500 italic">
                AI-generated content will appear here once data is loaded.
              </p>
            </div>
          )}

          {/* Add summary cards below letter for context */}
          {letterData && (
            <>
              <div className="my-12 pt-8 border-t border-neutral-200">
                <h3 className="text-lg font-serif font-bold text-neutral-900 mb-4">Portfolio Overview</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-azure/5 rounded-lg">
                    <div className="text-sm text-neutral-600">Total Holdings</div>
                    <div className="text-2xl font-bold text-neutral-900">{letterData.summary.total_holdings}</div>
                  </div>
                  <div className="p-4 bg-azure/5 rounded-lg">
                    <div className="text-sm text-neutral-600">Funds Allocated</div>
                    <div className="text-2xl font-bold text-neutral-900">
                      ${(letterData.summary.total_funds_allocated / 1000000).toFixed(1)}M
                    </div>
                  </div>
                  <div className="p-4 bg-azure/5 rounded-lg">
                    <div className="text-sm text-neutral-600">Portfolio NAV</div>
                    <div className="text-2xl font-bold text-neutral-900">
                      ${(letterData.summary.total_nav / 1000000).toFixed(1)}M
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-neutral-200">
                <div className="text-sm text-neutral-500 text-center">
                  Generated {new Date(letterData.summary.generated_at).toLocaleDateString()}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footnote */}
        <div className="mt-8 text-center text-sm text-neutral-600">
          <p>This letter is generated using real-time data from your portfolio.</p>
          <p className="mt-1">Ask questions below to explore any aspect in detail.</p>
        </div>

        {/* Conversation Messages */}
        {messages.length > 0 && (
          <div className="mt-12 pt-8 border-t border-neutral-200">
            <h3 className="text-xl font-serif font-bold text-neutral-900 mb-6">Conversation</h3>
            <div className="space-y-6">
              {messages.map((msg, idx) => (
                <div key={idx}>
                  <div
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-6 py-4 ${
                        msg.role === 'user'
                          ? 'bg-azure text-white'
                          : 'bg-neutral-100 text-neutral-900'
                      }`}
                    >
                      <p className="text-base whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      <p className={`text-xs mt-2 ${msg.role === 'user' ? 'text-white/70' : 'text-neutral-500'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  {/* Render inline widgets if present */}
                  {msg.widgets && msg.widgets.length > 0 && portfolio && (
                    <div className="mt-4 ml-0 max-w-[85%]">
                      {msg.widgets.map((widget) => (
                        <InlineWidget
                          key={widget.id}
                          widget={widget}
                          portfolioId={portfolio.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isLoadingResponse && (
                <div className="flex justify-start">
                  <div className="bg-neutral-100 rounded-2xl px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-azure rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-azure rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-azure rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </main>

      {/* Bottom Chat Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-creme border-t border-neutral-300 shadow-lg z-50 print:hidden">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask questions, request visualizations, or dive deeper into any metric..."
              className="flex-1 px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure text-base bg-creme"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={isLoadingResponse}
            />
            <button
              className="px-6 py-3 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity font-medium inline-flex items-center gap-2"
              onClick={sendMessage}
              disabled={!chatMessage.trim() || isLoadingResponse}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send
            </button>
          </div>
          <div className="mt-2 text-xs text-neutral-500 text-center">
            Ask for charts, graphs, or custom visualizations - they'll appear inline. Try: "Show me a trend of renewable energy" or "Create a pie chart of holdings"
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LetterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-creme flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-azure/30 border-t-azure rounded-full animate-spin mb-4"></div>
          <p className="text-neutral-800">Preparing your letter...</p>
        </div>
      </div>
    }>
      <LetterPageContent />
    </Suspense>
  );
}
