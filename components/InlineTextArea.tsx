'use client';

import { useState, useRef, useEffect } from 'react';

type InlineTextAreaProps = {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  placeholder?: string;
  className?: string;
};

export default function InlineTextArea({ value, onSave, placeholder = 'Double-click to edit', className = '' }: InlineTextAreaProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
      // Auto-resize textarea
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (editValue.trim() !== value) {
      await onSave(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
    // Save on Cmd/Ctrl + Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditValue(e.target.value);
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  if (isEditing) {
    return (
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={handleInput}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className={`${className} w-full border-2 border-indigo-500 rounded-lg px-3 py-2 bg-white outline-none resize-none overflow-hidden`}
          placeholder={placeholder}
          rows={3}
        />
        <p className="mt-1 text-xs text-neutral-500">Press Cmd/Ctrl+Enter to save, Esc to cancel</p>
      </div>
    );
  }

  return (
    <div
      className={`${className} cursor-pointer hover:bg-neutral-50 rounded-lg p-2 -m-2 transition-colors`}
      onDoubleClick={() => setIsEditing(true)}
      title="Double-click to edit"
    >
      <p className="whitespace-pre-wrap">{value || placeholder}</p>
    </div>
  );
}
