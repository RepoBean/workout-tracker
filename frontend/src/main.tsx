import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './shared/context/ThemeContext';
import { TimerProvider } from './shared/context/TimerContext';
import { OfflineProvider } from './shared/context/OfflineContext';
import { ToastProvider } from './shared/ui/Toast';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <OfflineProvider>
          <TimerProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </TimerProvider>
        </OfflineProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration failed:', err);
    });
  });
}
