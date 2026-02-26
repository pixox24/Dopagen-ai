import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    // Basic protection, though pages handle it too
    return <div className="p-10 text-center text-white">Redirecting...</div>;
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
      isActive
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
                  <span className="font-bold text-lg tracking-tight text-white">DopaGen <span className="text-[10px] text-carbon-muted font-normal uppercase ml-1">Admin</span></span>
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
                 <img src={user.avatar} className="w-8 h-8 rounded-full border border-carbon-border" />
                 <div className="overflow-hidden">
                     <p className="text-sm font-medium text-white truncate">{user.username}</p>
                     <p className="text-[10px] text-carbon-muted truncate">Admin Access</p>
                 </div>
             </div>
             <button 
                onClick={handleLogout}
                className="w-full py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded border border-transparent hover:border-red-500/20 transition-all"
            >
                Log Out
             </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-black relative">
        {/* Mobile Header */}
        <div className="md:hidden h-14 border-b border-carbon-border flex items-center justify-between px-4 bg-[#050505]">
            <span className="font-bold text-white">DopaGen Admin</span>
            <button onClick={() => navigate('/')} className="text-xs text-carbon-muted">Exit</button>
        </div>

        <div className="p-6 md:p-10 max-w-7xl mx-auto min-h-full">
            <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
