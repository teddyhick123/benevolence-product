'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

export interface TimelineScrubberProps {
  /** Start date of the timeline */
  startDate: Date;
  /** End date of the timeline (defaults to today) */
  endDate?: Date;
  /** Current selected date */
  currentDate: Date;
  /** Callback when date changes */
  onDateChange: (date: Date) => void;
  /** Animation speed in milliseconds per step (default: 100) */
  animationSpeed?: number;
  /** Number of steps in the timeline (default: 100) */
  steps?: number;
  /** Disabled state */
  disabled?: boolean;
}

export default function TimelineScrubber({
  startDate,
  endDate = new Date(),
  currentDate,
  onDateChange,
  animationSpeed = 100,
  steps = 100,
  disabled = false,
}: TimelineScrubberProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate current position (0-100)
  const totalMs = endDate.getTime() - startDate.getTime();
  const currentMs = currentDate.getTime() - startDate.getTime();
  const position = Math.max(0, Math.min(100, (currentMs / totalMs) * 100));

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Handle slider change
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPosition = Number(e.target.value);
    const newMs = startDate.getTime() + (newPosition / 100) * totalMs;
    const newDate = new Date(newMs);
    onDateChange(newDate);
  };

  // Handle play/pause
  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  // Handle reset
  const handleReset = () => {
    setIsPlaying(false);
    onDateChange(endDate);
  };

  // Animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const stepSize = totalMs / steps;

    intervalRef.current = setInterval(() => {
      const newMs = currentDate.getTime() - stepSize;

      if (newMs <= startDate.getTime()) {
        // Reached the start, stop playing
        setIsPlaying(false);
        onDateChange(startDate);
      } else {
        onDateChange(new Date(newMs));
      }
    }, animationSpeed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, currentDate, startDate, endDate, onDateChange, animationSpeed, steps, totalMs]);

  return (
    <div className="bg-white rounded-lg border border-black/10 shadow-sm p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-700">Timeline</h3>
        <div className="text-xs text-neutral-500">
          {formatDate(startDate)} - {formatDate(endDate)}
        </div>
      </div>

      {/* Current Date Display */}
      <div className="text-center mb-4">
        <div className="text-2xl font-bold text-azure">
          {formatDate(currentDate)}
        </div>
      </div>

      {/* Slider */}
      <div className="mb-4">
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={position}
          onChange={handleSliderChange}
          disabled={disabled}
          className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: `linear-gradient(to right, #5186a6 0%, #5186a6 ${position}%, #e5e7eb ${position}%, #e5e7eb 100%)`,
          }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          disabled={disabled || currentDate <= startDate}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-all
            ${isPlaying
              ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              : 'bg-azure text-white hover:bg-azure/90'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          title={isPlaying ? 'Pause' : 'Play backwards'}
        >
          {isPlaying ? (
            <>
              <Pause className="w-4 h-4" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Play
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={disabled || position >= 99.9}
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-black/10 text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          title="Reset to end"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>

      {/* Timeline Labels */}
      <div className="flex justify-between text-xs text-neutral-500 mt-3">
        <span>{formatDate(startDate)}</span>
        <span>{formatDate(endDate)}</span>
      </div>
    </div>
  );
}
