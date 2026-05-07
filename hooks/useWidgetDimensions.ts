'use client';
import { useEffect, useState, useRef, RefObject } from 'react';

interface Dimensions {
  width: number;
  height: number;
}

/**
 * Hook for consistent widget dimension tracking using ResizeObserver.
 * Returns container ref and current dimensions.
 */
export function useWidgetDimensions(
  defaultWidth = 400,
  defaultHeight = 300
): [RefObject<HTMLDivElement>, Dimensions] {
  const containerRef = useRef<HTMLDivElement>(null!);
  const [dimensions, setDimensions] = useState<Dimensions>({
    width: defaultWidth,
    height: defaultHeight,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      const newWidth = Math.round(rect.width) || defaultWidth;
      const newHeight = Math.round(rect.height) || defaultHeight;

      setDimensions(prev => {
        if (prev.width === newWidth && prev.height === newHeight) {
          return prev;
        }
        return { width: newWidth, height: newHeight };
      });
    };

    // Initial measurement
    updateDimensions();

    const ro = new ResizeObserver(() => {
      updateDimensions();
    });

    ro.observe(container);

    return () => {
      ro.disconnect();
    };
  }, [defaultWidth, defaultHeight]);

  return [containerRef, dimensions];
}
