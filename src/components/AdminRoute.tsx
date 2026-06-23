import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();

  if (loading) return null;
  if (profile?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
