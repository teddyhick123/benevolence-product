'use client';

import { useState, useRef, useEffect } from 'react';

type InlineEditProps = {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
  as?: 'span' | 'h1' | 'h2' | 'p';
  placeholder?: string;
};

export default function InlineEdit({ value, onSave, className = '', as = 'span', placeholder = 'Click to edit' }: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (editValue.trim() && editValue !== value) {
      setIsSaving(true);
      try {
        await onSave(editValue.trim());
      } catch (error) {
        console.error('Failed to save:', error);
        alert('Failed to save changes');
        setEditValue(value);
      } finally {
        setIsSaving(false);
      }
    } else {
      setEditValue(value);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  const Component = as;

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        className={`${className} border-b-2 border-indigo-500 bg-transparent outline-none`}
      />
    );
  }

  return (
    <Component
      className={`${className} cursor-pointer hover:text-neutral-600 transition-colors border-b-2 border-transparent hover:border-neutral-300`}
      onDoubleClick={() => setIsEditing(true)}
      title="Double-click to edit"
    >
      {value || placeholder}
    </Component>
  );
}