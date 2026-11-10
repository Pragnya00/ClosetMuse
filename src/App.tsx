import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AuthScreen from '@/components/AuthScreen';
import WardrobeView from '@/components/WardrobeView';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-8 h-8 text-stone-300 animate-spin" />
      </div>
    );
  }

  return user ? <WardrobeView /> : <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
