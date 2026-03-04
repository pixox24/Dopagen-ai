import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import Button from '../components/Button';

const Login: React.FC = () => {
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 验证模式状态
  const [isVerificationMode, setIsVerificationMode] = useState(false);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    let timer: number;
    if (isVerificationMode && countdown > 0) {
      timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    } else if (isVerificationMode && countdown === 0) {
      // 倒计时结束，返回登录模式
      setIsVerificationMode(false);
      setIsSignup(false);
      setCountdown(10);
      setPassword(''); // 安全起见清空密码，保留邮箱方便直接登录
    }
    return () => window.clearTimeout(timer);
  }, [isVerificationMode, countdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      if (isSignup) {
        if (!username.trim()) { setErrorMsg("Username cannot be empty"); return; }
        if (password.length < 6) { setErrorMsg("Password must be at least 6 characters"); return; }

        const { error } = await signup(email, password, username);
        if (error) {
          setErrorMsg(error.includes('User already registered') ? 'This email is already registered.' : error);
        } else {
          // 注册成功，不直接跳转，而是进入验证提示模式
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
    } catch (err) {
      setErrorMsg("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    setIsSignup(!isSignup);
    setErrorMsg(null);
  };

  if (isVerificationMode) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)] relative p-4 animate-fade-in">
        <div className="w-full max-w-[420px] bg-[#0c0c0c] border border-carbon-border rounded-2xl shadow-2xl p-8 relative overflow-hidden text-center">
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-green-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">Check your email</h2>
          <p className="text-carbon-muted text-sm mb-6">
            We've sent a verification link to <span className="text-white font-medium">{email}</span>.
            Please verify your email address to complete registration.
          </p>

          <div className="text-xs text-carbon-muted/70 bg-white/5 p-4 rounded-xl">
            Going to login page in <span className="text-white font-bold">{countdown}</span> seconds...
          </div>

          <Button
            variant="secondary"
            className="w-full mt-6"
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
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)] relative p-4 animate-fade-in">
      <div className="w-full max-w-[420px] bg-[#0c0c0c] border border-carbon-border rounded-2xl shadow-2xl p-8 relative overflow-hidden transition-all duration-300">

        {/* Subtle Background Glow */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="text-center mb-4 relative z-10">
          {/* dotLottie 动画 */}
          <div className="mx-auto w-[200px] h-[200px]">
            <DotLottieReact
              src="/lottie/The panda eats popcorn.lottie"
              loop
              autoplay
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 relative z-10 transition-all duration-300">

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-carbon-muted tracking-wide ml-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-carbon-surface border border-carbon-border text-white text-sm focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all outline-none"
              placeholder="you@example.com"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isSignup ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="space-y-1 pb-1">
              <label className="text-xs font-semibold uppercase text-carbon-muted tracking-wide ml-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-carbon-surface border border-carbon-border text-white text-sm focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all outline-none"
                placeholder="Creative Mind"
                required={isSignup}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-carbon-muted tracking-wide ml-1 flex justify-between">
              <span>Password</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-carbon-surface border border-carbon-border text-white text-sm focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all outline-none"
              placeholder="••••••••"
              required
              disabled={isSubmitting}
            />
          </div>

          {/* 错误提示区域 - 固定高度防止跳动 */}
          <div className={`transition-all duration-200 overflow-hidden ${errorMsg ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg flex items-start gap-2">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span>{errorMsg}</span>
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" variant="primary" className="w-full py-3.5 text-sm font-bold rounded-xl bg-white text-black hover:bg-gray-200 shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all" isLoading={isSubmitting} disabled={isSubmitting}>
              {isSignup ? "Create Account" : "Sign In"}
            </Button>
          </div>

          <div className="text-center text-[13px] text-carbon-muted pt-4 relative z-10 border-t border-carbon-border/50 mt-6">
            <span>{isSignup ? "Already have an account?" : "New to DopaGen?"}</span>
            <button
              type="button"
              onClick={toggleMode}
              disabled={isSubmitting}
              className="ml-2 text-white font-semibold hover:underline transition-all"
            >
              {isSignup ? "Log In" : "Sign Up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;