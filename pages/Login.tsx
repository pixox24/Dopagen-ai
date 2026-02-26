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

          <Button type="submit" variant="primary" className="w-full" size="lg" isLoading={isLoading} disabled={isLoading}>
            {isSignup ? "Sign Up" : "Sign In"}
          </Button>

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