'use client';

import { useState, useEffect } from 'react';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import AIAssistantPanel from './AIAssistantPanel';

type Props = {
  portfolioId: string;
};

export default function AIAssistantButton({ portfolioId }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  // Prevent body scroll when mobile panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Floating AI Button - adjusted for mobile browser chrome */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 sm:bottom-6 right-6 z-40 w-14 h-14 bg-gradient-to-br from-azure via-azure/90 to-azure/70 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 flex items-center justify-center group"
          title="Open AI Assistant"
          aria-label="Open AI Assistant"
        >
          <ChatBubbleLeftRightIcon className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse" />
        </button>
      )}

      {/* AI Assistant Panel - Full screen on mobile, floating on desktop */}
      {isOpen && (
        <>
          {/* Mobile overlay/backdrop */}
          <div
            className="sm:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
            aria-label="Close AI Assistant"
          />

          {/* Panel */}
          <div className="fixed inset-0 sm:inset-auto sm:bottom-6 sm:right-6 z-50 sm:w-96 sm:h-[600px] sm:shadow-2xl sm:rounded-lg">
            <AIAssistantPanel portfolioId={portfolioId} onClose={() => setIsOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}
