import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../shared/context/ThemeContext';
import { NextWorkout } from './components/NextWorkout';
import { Calendar } from './components/Calendar';
import { ResumeWorkout } from './components/ResumeWorkout';
import { ThisWeek } from './components/ThisWeek';
import { AdHocWorkoutPicker } from './components/AdHocWorkoutPicker';
import { Button } from '../../shared/ui/Button';
import { HeartRatePill } from '../../shared/ui/HeartRatePill';

export default function Dashboard() {
  const { theme, setTheme } = useTheme();
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);

  const cycleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // Date-led header: the training-relevant fact is what day it is, not the
  // app's own name (that's on the icon you just tapped).
  const today = new Date();
  const weekday = today.toLocaleDateString('en-US', { weekday: 'long' });
  const dateLabel = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-extrabold tracking-tight leading-tight">
            {weekday}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{dateLabel}</p>
        </div>
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
        size="md"
        className="w-full"
        onClick={() => setShowWorkoutPicker(true)}
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Quick Workout
        </span>
      </Button>

      {/* This Week */}
      <ThisWeek />

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
