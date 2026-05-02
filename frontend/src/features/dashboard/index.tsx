import { useState } from 'react';
import { Link } from 'react-router-dom';
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
          <Link
            to="/settings"
            className="p-2.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-800 transition-colors"
            title="Settings"
            aria-label="Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
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
