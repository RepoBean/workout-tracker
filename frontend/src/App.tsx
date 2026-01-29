import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './features/dashboard';
import ProgramBuilder from './features/program-builder';
import ActiveSession from './features/active-session';
import History from './features/history';
import { TimerIndicator } from './shared/ui/TimerIndicator';
import { useOffline } from './shared/context/OfflineContext';
import { ErrorBoundary } from './shared/ui/ErrorBoundary';
import { Button } from './shared/ui/Button';

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
          ? 'bg-primary-600 text-white'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
    >
      {children}
    </Link>
  );
}

function Navigation() {
  return (
    <nav className="bg-white dark:bg-gray-800 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link to="/" className="font-bold text-lg text-primary-600">
            Workout V2
          </Link>
          <TimerIndicator />
          <div className="flex gap-1">
            <NavLink to="/">Home</NavLink>
            <NavLink to="/programs">Programs</NavLink>
            <NavLink to="/history">History</NavLink>
          </div>
        </div>
      </div>
    </nav>
  );
}

function OfflineBanner() {
  const { isOnline } = useOffline();
  if (isOnline) return null;
  return (
    <div className="bg-amber-500 text-amber-900 text-center text-sm py-1.5 px-4 font-medium">
      You're offline — showing cached data
    </div>
  );
}

function WorkoutErrorFallback() {
  return (
    <div className="card max-w-md mx-auto text-center">
      <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
        Workout Error
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        Something went wrong during your workout. Your logged sets have been saved.
      </p>
      <div className="flex gap-2 justify-center">
        <Button variant="secondary" onClick={() => window.location.href = '/'}>
          Go Home
        </Button>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <Navigation />
        <OfflineBanner />
        <main className="container mx-auto px-4 py-6">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/programs" element={<ProgramBuilder />} />
              <Route
                path="/workout/:id"
                element={
                  <ErrorBoundary fallback={<WorkoutErrorFallback />}>
                    <ActiveSession />
                  </ErrorBoundary>
                }
              />
              <Route path="/history" element={<History />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
