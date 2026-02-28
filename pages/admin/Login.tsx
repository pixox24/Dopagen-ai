import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { grantTempAdminAccess, hasAdminAccess } from '../../lib/adminAccess';

const AdminLogin: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace state={{ from: '/admin/login' }} />;
  }

  if (hasAdminAccess(user)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    const result = grantTempAdminAccess(username.trim(), password);
    if (!result.success) {
      setErrorMsg(result.error || 'Admin login failed');
      setIsSubmitting(false);
      return;
    }

    const from = (location.state as { from?: string } | null)?.from;
    navigate(from || '/admin/dashboard', { replace: true });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-md carbon-card p-8 md:p-10">
        <h1 className="text-2xl font-semibold text-white mb-2">Admin Access</h1>
        <p className="text-sm text-carbon-muted mb-6">Admin operations can impact core site behavior. Authorized staff only.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium uppercase mb-2 text-carbon-muted tracking-wide">Admin Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 rounded-lg carbon-input text-sm font-medium"
              placeholder="fever8"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase mb-2 text-carbon-muted tracking-wide">Admin Password</label>
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
            disabled={isSubmitting}
            className="w-full py-3 px-6 rounded-lg font-semibold text-white bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500 disabled:opacity-80 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Authorizing...' : 'Enter Admin Console'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
