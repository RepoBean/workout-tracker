import { createContext, useContext, ReactNode } from 'react';

interface TimerContextType {
  isRunning: boolean;
  timeRemaining: number;
  startTimer: (duration: number) => void;
  stopTimer: () => void;
  resetTimer: () => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

/**
 * TimerProvider - Stub implementation for Phase 1
 * Full implementation will be added in Phase 3 with:
 * - Web Notifications API for vibration/sound
 * - Background tab drift correction
 * - Visual indicator in header
 */
export function TimerProvider({ children }: { children: ReactNode }) {
  // Placeholder implementation - to be completed in Phase 3
  const value: TimerContextType = {
    isRunning: false,
    timeRemaining: 0,
    startTimer: (_duration: number) => {
      console.log('Timer will be implemented in Phase 3');
    },
    stopTimer: () => {
      console.log('Timer will be implemented in Phase 3');
    },
    resetTimer: () => {
      console.log('Timer will be implemented in Phase 3');
    },
  };

  return (
    <TimerContext.Provider value={value}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return context;
}
