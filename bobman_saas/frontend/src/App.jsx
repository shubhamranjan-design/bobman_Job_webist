import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import ServicesPage from './pages/ServicesPage';
import AboutPage from './pages/AboutPage';
import LoginPage from './pages/LoginPage';
import RolesPage from './pages/RolesPage';
import RoleDetailPage from './pages/RoleDetailPage';
import CandidateDetailPage from './pages/CandidateDetailPage';
import MarketingShell from './components/MarketingShell';
import DashboardShell from './components/DashboardShell';
import { isAuthed } from './utils/auth';

function ProtectedRoute({ children }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isAuthed()) navigate('/login', { replace: true });
  }, [navigate]);
  if (!isAuthed()) return null;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public marketing site */}
      <Route path="/" element={<MarketingShell><LandingPage /></MarketingShell>} />
      <Route path="/services" element={<MarketingShell><ServicesPage /></MarketingShell>} />
      <Route path="/about" element={<MarketingShell><AboutPage /></MarketingShell>} />
      <Route path="/login" element={<LoginPage />} />

      {/* Protected dashboard area */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute><DashboardShell><RolesPage /></DashboardShell></ProtectedRoute>}
      />
      <Route
        path="/dashboard/roles/:code"
        element={<ProtectedRoute><DashboardShell><RoleDetailPage /></DashboardShell></ProtectedRoute>}
      />
      <Route
        path="/dashboard/roles/:code/candidates/:candidateId"
        element={<ProtectedRoute><DashboardShell><CandidateDetailPage /></DashboardShell></ProtectedRoute>}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
