'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import InlineWidget from '@/components/ui/InlineWidget';

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
  cached?: boolean;
  version?: number;
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
  const [holdingReportTriggered, setHoldingReportTriggered] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadPortfolio() {
      try {
        // First check URL params
        const urlPortfolioId = searchParams.get('portfolio_id');
        let portfolioId = urlPortfolioId;

        if (!portfolioId) {
          // Fall back to /api/me
          const res = await apiRequest('/api/me', { cache: 'no-store' });
          const data = await readJson(res);

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

          // Try to fetch cached letter first (GET)
          const cachedRes = await apiRequest(`/api/portfolio/${portfolioId}/letter/generate`);

          if (cachedRes.ok) {
            // Use cached letter
            const cachedData = await readJson(cachedRes);
            setLetterData(cachedData);
            setPortfolio({
              id: cachedData.portfolio.id,
              name: cachedData.portfolio.name,
              description: cachedData.portfolio.description,
            });
          } else {
            // No cached letter - generate new one
            setGeneratingLetter(true);
            const letterRes = await apiRequest(`/api/portfolio/${portfolioId}/letter/generate`, {
              method: 'POST',
            });
            const letterData = await readJson(letterRes);

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

  // Auto-trigger holding report when holding_id is in URL params
  useEffect(() => {
    const holdingId = searchParams.get('holding_id');
    if (!holdingId || !portfolio?.id || loading || holdingReportTriggered || isLoadingResponse) return;

    // Find holding name from letter data if available
    const holding = letterData?.holdings?.find((h) => h.id === holdingId);
    const holdingName = holding?.name || 'this holding';

    setHoldingReportTriggered(true);
    // Use setTimeout to ensure state is settled before sending
    setTimeout(() => {
      sendMessage(`Generate a detailed report about ${holdingName} (holding ID: ${holdingId}) with charts showing key metrics and trends.`);
    }, 500);
  }, [portfolio?.id, loading, holdingReportTriggered, isLoadingResponse, searchParams, letterData]);

  const sendMessage = async (overrideMessage?: string) => {
    const msgToSend = overrideMessage || chatMessage.trim();
    if (!msgToSend || isLoadingResponse || !portfolio?.id) return;

    const userMessage: Message = {
      role: 'user',
      content: msgToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!overrideMessage) setChatMessage('');
    setIsLoadingResponse(true);

    try {
      const res = await apiRequest('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: portfolio.id,
          message: msgToSend,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await readJson(res);

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

  const handleRegenerate = async () => {
    if (!portfolio?.id || generatingLetter) return;

    setGeneratingLetter(true);
    try {
      const res = await apiRequest(`/api/portfolio/${portfolio.id}/letter/generate?force=true`, {
        method: 'POST',
      });
      const data = await readJson(res);

      if (res.ok) {
        setLetterData(data);
      }
    } catch (error) {
      // Failed to regenerate
    } finally {
      setGeneratingLetter(false);
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleRegenerate}
              disabled={generatingLetter}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-creme/80 border border-neutral-300 hover:bg-creme text-sm font-medium text-neutral-700 transition-colors disabled:opacity-50"
              title="Generate a fresh letter with the latest data"
            >
              <svg className={`w-4 h-4 ${generatingLetter ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </button>
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
                I am pleased to present this comprehensive overview of your portfolio&apos;s performance and impact.
                {letterData?.portfolio.description && ` ${letterData.portfolio.description}`}
              </p>
              <p className="text-sm text-neutral-500 italic">
                AI-generated content will appear here once data is loaded.
              </p>
            </div>
          )}

          {/* Portfolio Overview Cards */}
          {letterData && (
            <>
              <div className="my-12 pt-8 border-t border-neutral-200/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
                  {/* Total Holdings Card */}
                  <div className="group relative overflow-hidden rounded-2xl border border-neutral-200/50 bg-white/50 backdrop-blur-sm p-6 transition-all hover:shadow-lg hover:-translate-y-0.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-medium text-neutral-500 mb-1">Total Holdings</div>
                        <div className="text-3xl font-serif font-bold text-neutral-900">{letterData.summary.total_holdings}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-azure/10">
                        <svg className="w-5 h-5 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Funds Allocated Card */}
                  <div className="group relative overflow-hidden rounded-2xl border border-neutral-200/50 bg-white/50 backdrop-blur-sm p-6 transition-all hover:shadow-lg hover:-translate-y-0.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-medium text-neutral-500 mb-1">Funds Allocated</div>
                        <div className="text-3xl font-serif font-bold text-neutral-900">
                          ${(letterData.summary.total_funds_allocated / 1000000).toFixed(1)}M
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-azure/10">
                        <svg className="w-5 h-5 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Consolidated footer section */}
              <div className="mt-10 pt-6 border-t border-neutral-200/50 text-center space-y-2">
                <p className="text-sm text-neutral-500">
                  {letterData.cached ? 'Letter from ' : 'Generated '}
                  {new Date(letterData.summary.generated_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                  {letterData.version && letterData.version > 1 && (
                    <span className="text-neutral-400"> (v{letterData.version})</span>
                  )}
                </p>
                <p className="text-sm text-neutral-600">
                  Ask questions below to explore details, request visualizations, or dive deeper into any metric.
                </p>
              </div>
            </>
          )}
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
                    <div className="mt-6 space-y-4">
                      {msg.widgets.map((widget) => (
                        <div
                          key={widget.id}
                          className="rounded-2xl border border-neutral-200/80 bg-white/50 backdrop-blur-sm p-6 shadow-sm"
                        >
                          {/* Optional widget header */}
                          {widget.title && (
                            <div className="mb-4 pb-3 border-b border-neutral-200/50">
                              <h4 className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                                <svg className="w-4 h-4 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                {widget.title}
                              </h4>
                            </div>
                          )}
                          <InlineWidget
                            widget={widget}
                            portfolioId={portfolio.id}
                          />
                        </div>
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

      {/* Bottom Chat Bar - Seamlessly Integrated */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-creme via-creme/95 to-creme/80 backdrop-blur-sm border-t border-neutral-200/50 z-50 print:hidden">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <div className="flex gap-3 items-end">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask a question about your portfolio..."
              className="flex-1 px-5 py-3 border border-neutral-200/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure/50 text-base bg-white/80 backdrop-blur-sm placeholder:text-neutral-400 transition-all shadow-sm hover:shadow"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={isLoadingResponse}
            />
            <button
              className="px-5 py-3 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all font-medium inline-flex items-center gap-2 shadow-soft hover:shadow-md disabled:hover:shadow-soft"
              onClick={() => sendMessage()}
              disabled={!chatMessage.trim() || isLoadingResponse}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span className="hidden sm:inline">Send</span>
            </button>
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
