import React, { Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/MainLayout';
import Home from './pages/Home';
const Login = React.lazy(() => import('./pages/Login'));
const Profile = React.lazy(() => import('./pages/Profile'));

// Admin imports - Lazy loaded for better bundle splitting
const AdminLayout = React.lazy(() => import('./layouts/AdminLayout'));
const Dashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const ModelList = React.lazy(() => import('./pages/admin/ModelList'));
const ModelImport = React.lazy(() => import('./pages/admin/ModelImport'));
const Settings = React.lazy(() => import('./pages/admin/Settings'));
const Placeholder = React.lazy(() => import('./pages/admin/Placeholder'));

import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { AdminAuthProvider } from './context/AdminAuthContext';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={
              <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-black"><div className="text-carbon-muted text-sm">Loading...</div></div>}>
                <Login />
              </Suspense>
            } />

            {/* Main App Layout */}
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="explore" element={<Navigate to="/?section=explore" replace />} />
              <Route path="profile" element={
                <Suspense fallback={<div className="p-8 text-center text-carbon-muted">Loading profile...</div>}>
                  <Profile />
                </Suspense>
              } />
            </Route>

            {/* Admin Layout - 独立认证，Lazy Loaded */}
            <Route path="/admin" element={
              <AdminAuthProvider>
                <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-black text-carbon-muted text-sm">Loading admin...</div>}>
                  <AdminLayout />
                </Suspense>
              </AdminAuthProvider>
            }>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={
                <Suspense fallback={<div className="p-8 text-center">Loading Dashboard...</div>}>
                  <Dashboard />
                </Suspense>
              } />

              <Route path="models" element={
                <Suspense fallback={<div className="p-8 text-center">Loading Models...</div>}>
                  <ModelList />
                </Suspense>
              } />
              <Route path="models/new" element={
                <Suspense fallback={<div className="p-8 text-center">Loading Model Import...</div>}>
                  <ModelImport />
                </Suspense>
              } />
              <Route path="settings" element={
                <Suspense fallback={<div className="p-8 text-center">Loading Settings...</div>}>
                  <Settings />
                </Suspense>
              } />

              {/* Placeholders */}
              <Route path="users" element={
                <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                  <Placeholder title="Users & Members" />
                </Suspense>
              } />
              <Route path="tasks" element={
                <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                  <Placeholder title="Task Management" />
                </Suspense>
              } />
              <Route path="content" element={
                <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                  <Placeholder title="Content Management" />
                </Suspense>
              } />
              <Route path="finance" element={
                <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                  <Placeholder title="Finance & Stats" />
                </Suspense>
              } />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AppProvider>
    </AuthProvider >
  );
};

export default App;
