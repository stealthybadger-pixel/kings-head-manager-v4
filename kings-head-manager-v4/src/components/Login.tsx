import React, { useState } from 'react';
import { LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-email': 'That email address doesn\'t look right.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
};

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(AUTH_ERROR_MESSAGES[err?.code] ?? 'Could not sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-surface-container-lowest">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm mx-4 flex flex-col gap-5 bg-surface p-8 border border-outline-variant rounded-sm shadow-lg"
      >
        <div className="flex flex-col items-center gap-2 pb-2">
          <span className="font-bold text-primary tracking-widest label-caps text-lg">King's Head v4</span>
          <p className="text-xs text-outline">Sign in to continue</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-sm bg-red-950/95 border border-red-500/30 text-red-100">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold leading-relaxed">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[10px] font-bold label-caps tracking-widest text-outline">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 px-3 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[10px] font-bold label-caps tracking-widest text-outline">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 px-3 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="h-11 flex items-center justify-center gap-2 rounded-sm bg-primary text-on-primary text-sm font-semibold disabled:opacity-60"
        >
          <LogIn className="h-4 w-4" />
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="text-[10px] text-outline text-center leading-relaxed">
          Accounts are created by a manager from the Team screen. Contact
          your manager if you don't have login details.
        </p>
      </form>
    </div>
  );
};

export default Login;
