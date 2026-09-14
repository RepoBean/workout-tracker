import { useEffect } from 'react';
import { startWorkoutService, stopWorkoutService } from '../../../shared/lib/foregroundService';

export function useWorkoutForegroundService(active: boolean) {
  useEffect(() => {
    if (active) {
      void startWorkoutService();
    } else {
      void stopWorkoutService();
    }

    return () => {
      void stopWorkoutService();
    };
  }, [active]);
}
