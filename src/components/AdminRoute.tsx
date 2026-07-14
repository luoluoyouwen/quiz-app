import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '../contexts/AuthContext';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading || (user && !profile)) {
    return (
      <div className="subpage-loading-card admin-route-loading">
        <Spin />
      </div>
    );
  }

  if (profile?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
