import { Routes, Route, Navigate } from 'react-router-dom';
import MarketingShell from './components/MarketingShell';
import CatalogPage from './pages/CatalogPage';
import CandidateDetailPage from './pages/CandidateDetailPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MarketingShell><CatalogPage /></MarketingShell>} />
      <Route path="/c/:maskedId" element={<MarketingShell><CandidateDetailPage /></MarketingShell>} />
      {/* Legacy paths → home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
