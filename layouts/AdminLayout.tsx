import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import Button from '../components/Button';

// ========== 管理员登录门禁页面 ==========
const AdminLoginGate: React.FC = () => {
  const { adminLogin } = useAdminAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await adminLogin(username, password);
      if (!result.success) {
        setError(result.error || 'Access denied');
      }
    } catch {
      setError('Network error. Is the backend running?');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-[380px] relative">
        {/* 安全标志 */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Admin Console</h1>
          <p className="text-carbon-muted text-xs">Restricted area. Authorized personnel only.</p>
        </div>

        {/* 登录表单 */}
        <form onSubmit={handleSubmit} className="bg-[#0a0a0a] border border-carbon-border rounded-2xl p-6 space-y-5">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-carbon-muted tracking-widest ml-1">Admin ID</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-carbon-surface border border-carbon-border text-white text-sm focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20 transition-all outline-none"
              placeholder="Enter admin username"
              required
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-carbon-muted tracking-widest ml-1">Access Key</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-carbon-surface border border-carbon-border text-white text-sm focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20 transition-all outline-none"
              placeholder="••••••••"
              required
              disabled={isSubmitting}
            />
          </div>

          {/* 错误提示 */}
          <div className={`transition-all duration-200 overflow-hidden ${error ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <span>{error}</span>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full py-3 text-sm font-bold rounded-xl bg-red-600 hover:bg-red-500 text-white border-none shadow-[0_0_20px_rgba(239,68,68,0.15)] hover:shadow-[0_0_30px_rgba(239,68,68,0.25)] transition-all"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            Authenticate
          </Button>
        </form>

        {/* 底部提示 */}
        <p className="text-center text-[11px] text-carbon-muted/40 mt-6">
          Session expires after 8 hours or when browser closes.
        </p>
      </div>
    </div>
  );
};

// ========== Admin 主布局 ==========
const AdminLayout: React.FC = () => {
  const { isAdminAuthenticated, adminUsername, adminLogout, isLoading } = useAdminAuth();
  const navigate = useNavigate();

  // 验证 token 期间显示加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-carbon-muted text-sm animate-pulse">Verifying admin session...</div>
      </div>
    );
  }

  // 未通过管理员认证 → 显示管理员独立登录页
  if (!isAdminAuthenticated) {
    return <AdminLoginGate />;
  }

  const handleLogout = () => {
    adminLogout();
  };

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${isActive
      ? 'bg-carbon-accent text-carbon-base shadow-lg shadow-white/10'
      : 'text-carbon-muted hover:text-white hover:bg-white/5'
    }`;

  return (
    <div className="flex h-screen bg-black overflow-hidden font-sans">

      {/* Sidebar */}
      <aside className="w-64 bg-[#050505] border-r border-carbon-border flex flex-col hidden md:flex">
        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-carbon-border/50">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-5 h-5 bg-white rounded-sm flex items-center justify-center">
              <div className="w-2 h-2 bg-black rounded-full"></div>
            </div>
            <span className="font-bold text-lg tracking-tight text-white">DopaGen <span className="text-[10px] text-red-400 font-normal uppercase ml-1">Admin</span></span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          <p className="px-4 text-[10px] font-bold text-carbon-muted uppercase tracking-wider mb-2 mt-2">Overview</p>

          <NavLink to="/admin/dashboard" className={navItemClass}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            Dashboard
          </NavLink>

          <p className="px-4 text-[10px] font-bold text-carbon-muted uppercase tracking-wider mb-2 mt-6">Management</p>

          <NavLink to="/admin/users" className={navItemClass}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            Users & Members
          </NavLink>

          <NavLink to="/admin/tasks" className={navItemClass}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            Tasks (Img/Vid)
          </NavLink>

          <NavLink to="/admin/models" className={navItemClass}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            Models Config
          </NavLink>

          <NavLink to="/admin/content" className={navItemClass}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            Content CMS
          </NavLink>

          <p className="px-4 text-[10px] font-bold text-carbon-muted uppercase tracking-wider mb-2 mt-6">System</p>

          <NavLink to="/admin/finance" className={navItemClass}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Finance & Stats
          </NavLink>

          <NavLink to="/admin/settings" className={navItemClass}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            Permissions
          </NavLink>
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-carbon-border bg-[#0a0a0a]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 text-xs font-bold">
              {adminUsername?.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{adminUsername}</p>
              <p className="text-[10px] text-red-400 truncate">Admin Access</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded border border-transparent hover:border-red-500/20 transition-all"
          >
            Log Out Admin
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-black relative">
        {/* Mobile Header */}
        <div className="md:hidden h-14 border-b border-carbon-border flex items-center justify-between px-4 bg-[#050505]">
          <span className="font-bold text-white">DopaGen <span className="text-red-400 text-xs">Admin</span></span>
          <div className="flex gap-2">
            <button onClick={() => navigate('/')} className="text-xs text-carbon-muted hover:text-white transition-colors">Exit</button>
            <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300 transition-colors">Logout</button>
          </div>
        </div>

        <div className="p-6 md:p-10 max-w-7xl mx-auto min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
