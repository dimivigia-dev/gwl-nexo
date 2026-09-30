import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import ProtectedRoute from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import ColaboradorDashboard from '@/pages/colaborador/ColaboradorDashboard';
import FiscalDashboard from '@/pages/fiscal/FiscalDashboard';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import ColaboradorManagement from '@/pages/admin/ColaboradorManagement';
import TimesheetEdit from '@/pages/admin/TimesheetEdit';

// New Admin Pages
import PostosDeServico from '@/pages/admin/PostosDeServico';
import ColaboradoresPage from '@/pages/admin/ColaboradoresPage';
import EntregaArquivos from '@/pages/admin/EntregaArquivos';
import LancamentoOperacional from '@/pages/admin/LancamentoOperacional';
import FolhaPonto from '@/pages/admin/FolhaPonto';
import CadastrosGerais from '@/pages/admin/CadastrosGerais';
import PrivacidadePage from '@/pages/admin/PrivacidadePage';
import ClienteDashboard from '@/pages/cliente/ClienteDashboard';
import PasswordChangeGate from '@/components/PasswordChangeGate';

function App() {
  return (
    <HashRouter>
      <AuthProvider>
          <PasswordChangeGate><Routes>
            <Route path="/" element={<LoginPage />} />
            
            {/* Colaborador Routes */}
            <Route
              path="/colaborador/*"
              element={
                <ProtectedRoute allowedProfiles={['Colaborador']}>
                  <Routes>
                    <Route index element={<ColaboradorDashboard />} />
                    <Route path="*" element={<Navigate to="/colaborador" replace />} />
                  </Routes>
                </ProtectedRoute>
              }
            />

            <Route path="/cliente/*" element={<ProtectedRoute allowedProfiles={['Cliente']}><Routes><Route index element={<ClienteDashboard />} /><Route path="*" element={<Navigate to="/cliente" replace />} /></Routes></ProtectedRoute>} />

            {/* Fiscal Routes */}
            <Route
              path="/fiscal/*"
              element={
                <ProtectedRoute allowedProfiles={['Fiscal']}>
                  <Routes>
                    <Route index element={<FiscalDashboard />} />
                    <Route path="*" element={<Navigate to="/fiscal" replace />} />
                  </Routes>
                </ProtectedRoute>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute allowedProfiles={['Administrador', 'Fiscal']}>
                  <Routes>
                    <Route index element={<ProtectedRoute allowedProfiles={['Administrador']}><AdminDashboard /></ProtectedRoute>} />
                    
                    {/* Updated Admin Route Structure */}
                    <Route path="postos-de-servico" element={<ProtectedRoute allowedProfiles={['Administrador']}><PostosDeServico /></ProtectedRoute>} />
                    <Route path="colaboradores" element={<ProtectedRoute allowedProfiles={['Administrador']}><ColaboradoresPage /></ProtectedRoute>} />
                    <Route path="colaboradores/novo" element={<ProtectedRoute allowedProfiles={['Administrador']}><ColaboradorManagement /></ProtectedRoute>} />
                    <Route path="colaboradores/:id" element={<ProtectedRoute allowedProfiles={['Administrador']}><ColaboradorManagement /></ProtectedRoute>} />
                    
                    <Route path="entrega-arquivos" element={<EntregaArquivos />} />
                    <Route path="lancamento-operacional" element={<LancamentoOperacional />} />
                    <Route path="folha-ponto" element={<FolhaPonto />} />

                    <Route path="cadastros-gerais" element={<ProtectedRoute allowedProfiles={['Administrador']}><CadastrosGerais /></ProtectedRoute>} />
                    <Route path="privacidade" element={<PrivacidadePage />} />

                    {/* Legacy / Direct Timesheet Edit */}
                    <Route path="timesheet" element={<FolhaPonto />} /> 
                    <Route path="timesheet/:id" element={<TimesheetEdit />} />
                    
                    <Route path="*" element={<Navigate to="/admin" replace />} />
                  </Routes>
                </ProtectedRoute>
              }
            />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes></PasswordChangeGate>
          <Toaster />
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
