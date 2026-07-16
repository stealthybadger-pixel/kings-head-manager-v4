import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../../src/hooks/useAuth';
import Login from '../../src/components/Login';
import { useStore } from '../../src/store/useStore';
import CatalogueMatcher from './CatalogueMatcher';
import '../../src/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

// Minimal shell: auth-gate + toast rendering, borrowed from App.tsx, without
// any of the main app's navigation/routing — this tool is a single screen.
const Root: React.FC = () => {
  const { firebaseUser, loading } = useAuth();
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface-container-lowest">
        <span className="text-xs font-bold label-caps tracking-widest text-outline">Loading...</span>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Login />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <CatalogueMatcher />
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-[200]">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => dismissToast(t.id)}
            className={`px-4 py-2.5 rounded-sm text-xs font-semibold shadow-lg cursor-pointer ${
              t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-surface-container-high text-on-surface'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
