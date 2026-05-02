import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './features/dashboard';
import ProgramBuilder from './features/program-builder';
import Progress from './features/progress';
import ActiveSession from './features/active-session';
import History from './features/history';
import Settings from './features/settings';
import { useOffline } from './shared/context/OfflineContext';
import { ErrorBoundary } from './shared/ui/ErrorBoundary';
import { Button } from './shared/ui/Button';

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const color = active ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500';
  const cls = `w-6 h-6 ${color}`;

  switch (name) {
    case 'home':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
        </svg>
      );
    case 'programs':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      );
    case 'progress':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      );
    case 'history':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return null;
  }
}

function BottomTabBar() {
  const location = useLocation();

  // Hide tab bar during active workout session
  if (location.pathname.startsWith('/workout/')) return null;

  const tabs = [
    { to: '/', label: 'Home', icon: 'home' },
    { to: '/programs', label: 'Programs', icon: 'programs' },
    { to: '/progress', label: 'Progress', icon: 'progress' },
    { to: '/history', label: 'History', icon: 'history' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-surface-850 border-t border-gray-200 dark:border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
      <div className="flex">
        {tabs.map(({ to, label, icon }) => {
          const isActive = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] transition-colors ${
                isActive
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              <TabIcon name={icon} active={isActive} />
              <span className={`text-[10px] mt-0.5 font-medium ${isActive ? 'font-semibold' : ''}`}>
                {label}
              </span>
            </Link>
          );
        })}
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

function AppContent() {
  const location = useLocation();
  const isWorkout = location.pathname.startsWith('/workout/');

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 transition-colors">
      <OfflineBanner />
      <main className={`container mx-auto px-4 py-6 ${isWorkout ? '' : 'pb-24'}`}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/programs" element={<ProgramBuilder />} />
            <Route path="/progress" element={<Progress />} />
            <Route
              path="/workout/:id"
              element={
                <ErrorBoundary fallback={<WorkoutErrorFallback />}>
                  <ActiveSession />
                </ErrorBoundary>
              }
            />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <BottomTabBar />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
