'use client';

import { useState } from 'react';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import AIAssistantPanel from './AIAssistantPanel';

type Props = {
  portfolioId: string;
};

export default function AIAssistantButton({ portfolioId }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating AI Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-azure text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 flex items-center justify-center group"
          title="Open AI Assistant"
        >
          <ChatBubbleLeftRightIcon className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse" />
        </button>
      )}

      {/* AI Assistant Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-96 h-[600px] shadow-2xl rounded-lg">
          <AIAssistantPanel portfolioId={portfolioId} onClose={() => setIsOpen(false)} />
        </div>
      )}
    </>
  );
}
