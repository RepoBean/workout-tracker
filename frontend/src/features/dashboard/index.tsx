import { useTheme } from '../../shared/context/ThemeContext';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Workout Tracker V2</h1>

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

      {/* Next Workout Card */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">Next Workout</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Set up a program to see your next workout here.
        </p>
        <Link to="/programs" className="btn-primary inline-block">
          View Programs
        </Link>
      </div>

      {/* Quick Links */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/programs"
            className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <div className="text-2xl mb-1">📋</div>
            <div className="font-medium">Programs</div>
          </Link>
          <Link
            to="/history"
            className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <div className="text-2xl mb-1">📊</div>
            <div className="font-medium">History</div>
          </Link>
        </div>
      </div>

      {/* Phase 1 Complete Notice */}
      <div className="card border-2 border-green-500 dark:border-green-400">
        <h2 className="text-lg font-semibold text-green-700 dark:text-green-400 mb-2">
          Phase 1 Complete
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Foundation scaffolding is ready. The app structure is set up with routing,
          dark mode, and database models. Features will be built in subsequent phases.
        </p>
      </div>
    </div>
  );
}
