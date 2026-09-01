import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <div className="min-h-screen bg-background" />;
  if (!auth.authenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
