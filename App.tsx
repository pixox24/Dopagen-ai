import React, { Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Generate from './pages/Generate';
import Explore from './pages/Explore';
import Profile from './pages/Profile';
import Login from './pages/Login';

// Admin imports - Lazy loaded for better bundle splitting
import AdminLayout from './layouts/AdminLayout';
const Dashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const ModelList = React.lazy(() => import('./pages/admin/ModelList'));
const ModelImport = React.lazy(() => import('./pages/admin/ModelImport'));
const Settings = React.lazy(() => import('./pages/admin/Settings'));
const Placeholder = React.lazy(() => import('./pages/admin/Placeholder'));

import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Main App Layout */}
            <Route path="/" element={<Layout />}>
              <Route index element={<Generate />} />
              <Route path="explore" element={<Explore />} />
              <Route path="profile" element={<Profile />} />
            </Route>

            {/* Admin Layout - Lazy Loaded with Suspense */}
            <Route path="/admin" element={<AdminLayout />}>
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
    </AuthProvider>
  );
};

export default App;
