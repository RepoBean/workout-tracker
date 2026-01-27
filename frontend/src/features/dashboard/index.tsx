import { useTheme } from '../../shared/context/ThemeContext';
import { Link } from 'react-router-dom';
import { NextWorkout } from './components/NextWorkout';
import { Calendar } from './components/Calendar';
import { ResumeWorkout } from './components/ResumeWorkout';
import { StatsCard } from './components/StatsCard';
import { useStartSession } from '../active-session/hooks/useStartSession';
import { Button } from '../../shared/ui/Button';

export default function Dashboard() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const startSession = useStartSession();

  const handleQuickWorkout = () => {
    startSession.mutate({ isAdHoc: true });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Workout Tracker V2</h1>

      {/* Resume In-Progress Workout */}
      <ResumeWorkout />

      {/* Next Workout Card */}
      <NextWorkout />

      {/* Quick Workout */}
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={handleQuickWorkout}
        disabled={startSession.isPending}
      >
        {startSession.isPending ? 'Starting...' : 'Quick Workout (Ad-hoc)'}
      </Button>

      {/* Calendar */}
      <Calendar />

      {/* Stats */}
      <StatsCard />

      {/* Quick Links */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/programs"
            className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <div className="text-2xl mb-1">
              <svg className="w-8 h-8 mx-auto text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="font-medium">Programs</div>
          </Link>
          <Link
            to="/history"
            className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <div className="text-2xl mb-1">
              <svg className="w-8 h-8 mx-auto text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="font-medium">History</div>
          </Link>
        </div>
      </div>

      {/* Theme Settings Card */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Theme Settings</h2>
        <div className="flex gap-2 flex-wrap">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                theme === t
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Current resolved theme: <span className="font-medium">{resolvedTheme}</span>
        </p>
      </div>
    </div>
  );
}
