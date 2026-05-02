import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './shared/context/ThemeContext';
import { TimerProvider } from './shared/context/TimerContext';
import { OfflineProvider } from './shared/context/OfflineContext';
import { HeartRateProvider } from './shared/context/HeartRateContext';
import { UserProfileProvider } from './shared/context/UserProfileContext';
import { ToastProvider } from './shared/ui/Toast';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <OfflineProvider>
          <TimerProvider>
            <HeartRateProvider>
              <UserProfileProvider>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </UserProfileProvider>
            </HeartRateProvider>
          </TimerProvider>
        </OfflineProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
