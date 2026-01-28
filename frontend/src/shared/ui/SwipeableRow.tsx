import { useRef, useState, useCallback, type ReactNode } from 'react';

interface SwipeableRowProps {
  onSwipeLeft: () => void;
  disabled?: boolean;
  children: ReactNode;
}

const SWIPE_THRESHOLD = 80;
const MAX_SWIPE = 120;
const VERTICAL_TOLERANCE = 30;

export function SwipeableRow({ onSwipeLeft, disabled = false, children }: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    locked.current = false;
    setSwiping(false);
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // If vertical movement exceeds tolerance, this is a scroll not a swipe
    if (!locked.current && Math.abs(dy) > VERTICAL_TOLERANCE) {
      locked.current = true;
      return;
    }
    if (locked.current) return;

    // Only handle left swipe (negative dx)
    if (dx < 0) {
      setSwiping(true);
      setOffset(Math.max(-MAX_SWIPE, dx));
    }
  }, [disabled]);

  const handleTouchEnd = useCallback(() => {
    if (disabled) return;
    if (offset < -SWIPE_THRESHOLD) {
      onSwipeLeft();
    }
    setOffset(0);
    setSwiping(false);
  }, [disabled, offset, onSwipeLeft]);

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Red delete background */}
      <div className="absolute inset-0 bg-red-500 flex items-center justify-end pr-4">
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </div>

      {/* Swipeable content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping ? 'none' : 'transform 0.2s ease-out',
        }}
        className="relative bg-white dark:bg-gray-900"
      >
        {children}
      </div>
    </div>
  );
}
