import { useState } from 'react';
import { useTheme } from '../../shared/context/ThemeContext';
import { NextWorkout } from './components/NextWorkout';
import { Calendar } from './components/Calendar';
import { ResumeWorkout } from './components/ResumeWorkout';
import { StatsCard } from './components/StatsCard';
import { AdHocWorkoutPicker } from './components/AdHocWorkoutPicker';
import { Button } from '../../shared/ui/Button';
import { HeartRatePill } from '../../shared/ui/HeartRatePill';

export default function Dashboard() {
  const { theme, setTheme } = useTheme();
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);

  const cycleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Workout Tracker</h1>
        <div className="flex items-center gap-2">
          <HeartRatePill />
          <button
            onClick={cycleTheme}
            className="p-2.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-800 transition-colors"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
          {theme === 'dark' ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
          </button>
        </div>
      </div>

      {/* Resume In-Progress Workout */}
      <ResumeWorkout />

      {/* Next Workout Card (Hero) */}
      <NextWorkout />

      {/* Quick Workout */}
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={() => setShowWorkoutPicker(true)}
      >
        Quick Workout (Ad-hoc)
      </Button>

      {/* Stats */}
      <StatsCard />

      {/* Calendar */}
      <Calendar />

      {/* Ad-hoc Workout Picker Modal */}
      <AdHocWorkoutPicker
        isOpen={showWorkoutPicker}
        onClose={() => setShowWorkoutPicker(false)}
      />
    </div>
  );
}
