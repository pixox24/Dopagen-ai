import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';

const LOGIN_HERO_SRC = '/images/login-hero-410.jpg';
const LOGIN_HERO_SRC_SET = '/images/login-hero-410.jpg 1x, /images/login-hero-820.jpg 2x';

const Login: React.FC = () => {
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isVerificationMode, setIsVerificationMode] = useState(false);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    let timer: number | undefined;

    if (isVerificationMode && countdown > 0) {
      timer = window.setTimeout(() => setCountdown((current) => current - 1), 1000);
    } else if (isVerificationMode && countdown === 0) {
      setIsVerificationMode(false);
      setIsSignup(false);
      setCountdown(10);
      setPassword('');
    }

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [isVerificationMode, countdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      if (isSignup) {
        if (!username.trim()) {
          setErrorMsg('Username cannot be empty');
          return;
        }

        if (password.length < 6) {
          setErrorMsg('Password must be at least 6 characters');
          return;
        }

        const { error } = await signup(email, password, username);

        if (error) {
          setErrorMsg(error.includes('User already registered') ? 'This email is already registered.' : error);
        } else {
          setIsVerificationMode(true);
        }
      } else {
        const { error } = await login(email, password);

        if (error) {
          setErrorMsg('Invalid email or password. Or please verify your email first.');
        } else {
          navigate('/');
        }
      }
    } catch {
      setErrorMsg('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    setIsSignup((current) => !current);
    setErrorMsg(null);
  };

  if (isVerificationMode) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-8 animate-fade-in">
        <div className="relative w-full max-w-[420px]">
          <div className="pointer-events-none absolute inset-x-10 top-8 h-32 rounded-full bg-green-500/10 blur-3xl" />

          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0b0c]/95 p-8 text-center shadow-[0_30px_90px_rgba(0,0,0,0.58)] backdrop-blur">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-green-400/20 bg-green-500/12 text-green-300">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>

            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.34em] text-carbon-muted">Verify Email</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Check your inbox</h2>
            <p className="mt-3 text-sm leading-6 text-carbon-muted">
              We&apos;ve sent a verification link to <span className="font-medium text-white">{email}</span>.
              Open it once, then come back here to sign in.
            </p>

            <div className="mt-6 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-xs text-carbon-muted">
              Going back to login in <span className="font-semibold text-white">{countdown}</span> seconds.
            </div>

            <Button
              variant="secondary"
              className="mt-6 w-full"
              onClick={() => {
                setIsVerificationMode(false);
                setIsSignup(false);
                setCountdown(10);
                setPassword('');
              }}
            >
              Go to Login Now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const eyebrow = isSignup ? 'Create Account' : 'Welcome Back';
  const title = isSignup ? 'Create your workspace.' : 'Sign in to keep creating.';
  const description = isSignup
    ? 'A lighter login screen, a faster first paint, and your drafts ready when you are.'
    : 'Your models, local drafts, and published work pick up right where you left off.';

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-8 animate-fade-in">
      <div className="relative w-full max-w-[420px]">
        <div className="pointer-events-none absolute inset-x-8 top-10 h-36 rounded-full bg-[#7b2336]/18 blur-3xl" />

        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0b0c]/95 shadow-[0_36px_100px_rgba(0,0,0,0.62)] backdrop-blur">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <div
              className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#120c0f]"
              style={{ aspectRatio: '1235 / 485' }}
            >
              <img
                src={LOGIN_HERO_SRC}
                srcSet={LOGIN_HERO_SRC_SET}
                alt="Editorial portrait"
                width={820}
                height={322}
                className="h-full w-full object-cover"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.58)_100%)]" />
              <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
                <div className="max-w-[80%]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-white/60">DopaGen</p>
                  <p className="mt-2 text-sm font-medium leading-5 text-white/92">
                    Cinematic look, static payload, almost no startup cost.
                  </p>
                </div>
                <div className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/35 text-sm font-semibold text-white/72 sm:flex">
                  V
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-6 pt-5 sm:px-6">
            <div className="mb-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-carbon-muted">{eyebrow}</p>
              <h1 className="mt-2 text-[28px] font-semibold leading-[1.05] tracking-tight text-white">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-carbon-muted">{description}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="ml-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-carbon-muted">
                  Email
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-carbon-border bg-carbon-surface px-4 py-3 text-sm text-white outline-none transition-all focus:border-[#8b3140]/50 focus:ring-1 focus:ring-[#8b3140]/20"
                  placeholder="you@example.com"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isSignup ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="space-y-1.5 pb-1">
                  <label className="ml-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-carbon-muted">
                    Username
                  </label>
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-2xl border border-carbon-border bg-carbon-surface px-4 py-3 text-sm text-white outline-none transition-all focus:border-[#8b3140]/50 focus:ring-1 focus:ring-[#8b3140]/20"
                    placeholder="Creative Mind"
                    required={isSignup}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="ml-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-carbon-muted">
                  Password
                </label>
                <input
                  type="password"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-carbon-border bg-carbon-surface px-4 py-3 text-sm text-white outline-none transition-all focus:border-[#8b3140]/50 focus:ring-1 focus:ring-[#8b3140]/20"
                  placeholder="At least 6 characters"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className={`overflow-hidden transition-all duration-200 ${errorMsg ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{errorMsg}</span>
                </div>
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full rounded-2xl bg-white py-3.5 text-sm font-bold text-black shadow-[0_0_18px_rgba(255,255,255,0.12)] transition-all hover:bg-[#f0e8ea] hover:shadow-[0_0_24px_rgba(255,255,255,0.18)]"
                  isLoading={isSubmitting}
                  disabled={isSubmitting}
                >
                  {isSignup ? 'Create Account' : 'Sign In'}
                </Button>
              </div>

              <div className="mt-5 border-t border-white/8 pt-4 text-center text-[13px] text-carbon-muted">
                <span>{isSignup ? 'Already have an account?' : 'New to DopaGen?'}</span>
                <button
                  type="button"
                  onClick={toggleMode}
                  disabled={isSubmitting}
                  className="ml-2 font-semibold text-[#f1dce1] transition-colors hover:text-white"
                >
                  {isSignup ? 'Log In' : 'Sign Up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
