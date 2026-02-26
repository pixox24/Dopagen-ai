import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from './Button';

// Extract navLinkClass outside component to avoid recreating function on every render
const navLinkClass = ({ isActive }: { isActive: boolean }) => 
  `px-3 py-1.5 text-sm font-medium transition-colors duration-200 rounded-md ${
    isActive 
      ? 'text-carbon-text bg-carbon-card border border-carbon-border' 
      : 'text-carbon-muted hover:text-carbon-text hover:bg-white/5'
  }`;

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-carbon-base text-carbon-text font-sans selection:bg-white/20">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-carbon-border bg-carbon-base/80 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex justify-between h-14 items-center">
            
            {/* Logo */}
            <div className="flex items-center gap-8">
                <div className="flex-shrink-0 flex items-center cursor-pointer gap-2" onClick={() => navigate('/')}>
                  <div className="w-5 h-5 bg-white rounded-sm flex items-center justify-center">
                    <div className="w-2 h-2 bg-black rounded-full"></div>
                  </div>
                  <span className="font-bold text-lg tracking-tight text-white">DopaGen</span>
                </div>

                {/* Desktop Nav */}
                <nav className="hidden md:flex space-x-2 items-center">
                  <NavLink to="/" className={navLinkClass}>
                    Create
                  </NavLink>
                  <NavLink to="/explore" className={navLinkClass}>
                    Explore
                  </NavLink>
                  <NavLink to="/profile" className={navLinkClass}>
                    Profile
                  </NavLink>
                  <NavLink to="/admin" className={navLinkClass}>
                    Admin
                  </NavLink>
                </nav>
            </div>

            {/* User Controls */}
            <div className="hidden md:flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-3">
                  <div className="text-xs font-medium text-carbon-muted">
                    {user.email}
                  </div>
                  <div className="w-px h-4 bg-carbon-border"></div>
                  <Button variant="outline" size="sm" onClick={handleLogout} className="h-8 border-none hover:bg-transparent text-carbon-muted hover:text-white px-0">Log Out</Button>
                  <img src={user.avatar} className="w-6 h-6 rounded-full border border-carbon-border grayscale hover:grayscale-0 transition-all" alt="avatar" />
                </div>
              ) : (
                <Button variant="primary" size="sm" onClick={() => navigate('/login')} className="h-8">Log in</Button>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-carbon-muted hover:text-white transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute w-full bg-carbon-base border-b border-carbon-border">
            <div className="px-4 pt-2 pb-4 space-y-1">
                <NavLink to="/" className="block px-3 py-2 rounded-md text-sm font-medium text-carbon-text hover:bg-carbon-surface" onClick={() => setMobileMenuOpen(false)}>Create</NavLink>
                <NavLink to="/explore" className="block px-3 py-2 rounded-md text-sm font-medium text-carbon-text hover:bg-carbon-surface" onClick={() => setMobileMenuOpen(false)}>Explore</NavLink>
                <NavLink to="/profile" className="block px-3 py-2 rounded-md text-sm font-medium text-carbon-text hover:bg-carbon-surface" onClick={() => setMobileMenuOpen(false)}>Profile</NavLink>
                <NavLink to="/admin" className="block px-3 py-2 rounded-md text-sm font-medium text-carbon-text hover:bg-carbon-surface" onClick={() => setMobileMenuOpen(false)}>Admin</NavLink>
                
                <div className="pt-4 border-t border-carbon-border mt-2">
                    {user ? (
                        <button className="block w-full text-left px-3 py-2 text-red-400 font-medium text-sm" onClick={handleLogout}>Log Out</button>
                    ) : (
                        <button className="block w-full text-left px-3 py-2 text-white font-medium text-sm" onClick={() => { navigate('/login'); setMobileMenuOpen(false); }}>Login</button>
                    )}
                </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-grow w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-8 relative z-10">
        <Outlet />
      </main>
      
      <footer className="mt-12 py-8 border-t border-carbon-border">
        <div className="max-w-[1400px] mx-auto px-6 flex justify-between items-center text-xs text-carbon-muted">
            <p className="font-medium">DopaGen AI © 2024</p>
            <div className="flex gap-4">
                <span>Terms</span>
                <span>Privacy</span>
                <span>Status</span>
            </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;