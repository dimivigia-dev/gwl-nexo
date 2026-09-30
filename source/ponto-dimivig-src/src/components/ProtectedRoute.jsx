import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children, allowedProfiles = [] }) => {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-[#ff8c00]" />
          <p className="text-gray-400 text-sm">Carregando permissões...</p>
        </div>
      </div>
    );
  }

  // If not logged in, redirect to Login
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // If we have a user but no profile yet (and not loading), something is wrong with data
  if (!userProfile) {
     return (
        <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a] text-white">
           <div className="max-w-md p-6 bg-red-900/20 border border-red-500 rounded-lg text-center">
             <h2 className="text-xl font-bold mb-2">Erro de Perfil</h2>
             <p>Seu usuário foi autenticado, mas não encontramos seu perfil no sistema.</p>
           </div>
        </div>
     );
  }

  // Check roles
  // Note: userProfile.perfil must match one of 'Administrador', 'Fiscal', 'Colaborador'
  if (allowedProfiles.length > 0 && !allowedProfiles.includes(userProfile.perfil)) {
    // Unauthorized access attempt: Redirect to their correct home or logout?
    // Safer to redirect to root, which will re-evaluate where they belong
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;