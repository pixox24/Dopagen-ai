import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';

const Login: React.FC = () => {
  const { login, signup, isLoading } = useAuth();
  const navigate = useNavigate();

  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isSignup) {
      if (!username) { setErrorMsg("Username required"); return; }
      if (password.length < 6) { setErrorMsg("Password must be at least 6 characters"); return; }

      const { error } = await signup(email, password, username);
      if (error) setErrorMsg(error);
      else navigate('/');
    } else {
      const { error } = await login(email, password);
      if (error) setErrorMsg(error);
      else navigate('/');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh] relative">
      <div className="w-full max-w-md carbon-card p-8 md:p-10 relative overflow-hidden">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-white">
            {isSignup ? "Create Account" : "Welcome Back"}
          </h2>
          <p className="text-carbon-muted text-sm mt-2">
            {isSignup ? "Join the DopaGen community." : "Sign in to continue."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div>
            <label className="block text-[11px] font-medium uppercase mb-2 text-carbon-muted tracking-wide">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-lg carbon-input text-sm font-medium"
              placeholder="you@example.com"
              required
            />
          </div>

          {isSignup && (
            <div>
              <label className="block text-[11px] font-medium uppercase mb-2 text-carbon-muted tracking-wide">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-3 rounded-lg carbon-input text-sm font-medium"
                placeholder="NeoArtist"
                required={isSignup}
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium uppercase mb-2 text-carbon-muted tracking-wide">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded-lg carbon-input text-sm font-medium"
              placeholder="••••••"
              required
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-900/10 border border-red-900/20 text-red-400 text-xs rounded">
              {errorMsg}
            </div>
          )}

          <button 
              type="submit" 
              disabled={isLoading}
              className={`
                  w-full py-3 px-6 rounded-lg font-semibold text-white 
                  bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500
                  bg-size-200 animate-gradient
                  transition-all duration-300
                  ${isLoading ? 'opacity-80 cursor-not-allowed' : 'hover:shadow-[0_0_20px_rgba(6,182,212,0.5)] hover:scale-[1.02]'}
              `}
              style={{ backgroundSize: '200% 100%' }}
          >
              {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>{isSignup ? 'Creating Account...' : 'Signing In...'}</span>
                  </span>
              ) : (
                  isSignup ? "Sign Up" : "Sign In"
              )}
          </button>
          <style>{`
              @keyframes gradient {
                  0% { background-position: 0% 50%; }
                  50% { background-position: 100% 50%; }
                  100% { background-position: 0% 50%; }
              }
              .animate-gradient {
                  animation: gradient 2s ease infinite;
              }
              .bg-size-200 {
                  background-size: 200% 100%;
              }
          `}</style>

          <div className="text-center text-xs text-carbon-muted pt-4">
            <span className="opacity-70">{isSignup ? "Already have an account?" : "No account yet?"}</span>
            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
              className="ml-2 text-white hover:underline font-medium"
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