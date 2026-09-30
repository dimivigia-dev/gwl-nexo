import React, { createContext, useContext, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  // A sessão do portal não deve abrir automaticamente uma área do Ponto.
  // O perfil só é carregado depois da confirmação explícita na tela de entrada.
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [canBootstrap, setCanBootstrap] = useState(false);
  const [canOwnerRecover, setCanOwnerRecover] = useState(false);
  const [ownerLogin, setOwnerLogin] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const { toast } = useToast();

  const applySession = (data) => {
    const account = data.user || {};
    const profile = data.appUser || {};
    setUser({ id: profile.id, email: account.email });
    setUserProfile({
      id: profile.id,
      nome: profile.name || account.fullName || account.displayName || account.email,
      perfil: profile.role || 'Colaborador',
      email: account.email,
      employeeId: profile.employee_id || null,
      siteId: profile.site_id || null,
    });
    setMustChangePassword(Boolean(data.mustChangePassword));
    return { success: true, user: account };
  };

  const changePassword = async (currentPassword, newPassword) => {
    const response = await fetch('/api/ponto-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'changePassword', currentPassword, newPassword }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível trocar a senha.');
    setMustChangePassword(false);
    return data;
  };

  const checkSession = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ponto-auth', { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao conferir a sessão.');
      setNeedsSetup(Boolean(data.needsSetup));
      setCanBootstrap(Boolean(data.canBootstrap));
      setCanOwnerRecover(Boolean(data.canOwnerRecover));
      setOwnerLogin(data.ownerLogin || '');
      if (data.authenticated) applySession(data);
      else { setUser(null); setUserProfile(null); }
    } catch (error) {
      setUser(null);
      setUserProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { checkSession(); }, []);

  const login = async (accessType = 'colaborador', email = '', password = '', remember = false) => {
    setLoading(true);
    try {
      const response = await fetch('/api/ponto-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'login', accessType, email, password, remember }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
      const result = applySession(data);
      toast({ title: 'Acesso confirmado', description: accessType === 'administrativo' ? 'Bem-vindo à Administração.' : 'Bem-vindo ao seu ponto.' });
      return result;
    } catch (error) {
      toast({ title: 'Acesso não autorizado', description: error.message, variant: 'destructive' });
      return { success: false, error };
    } finally { setLoading(false); }
  };

  const bootstrap = async (password, remember = true) => {
    setLoading(true);
    try {
      const response = await fetch('/api/ponto-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'bootstrap', password, remember }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível ativar o acesso.');
      setNeedsSetup(false); setCanBootstrap(false); applySession(data);
      toast({ title: 'Acesso administrativo ativado', description: 'Sua senha foi criada com segurança.' });
      return { success: true };
    } catch (error) {
      toast({ title: 'Não foi possível ativar', description: error.message, variant: 'destructive' });
      return { success: false, error };
    } finally { setLoading(false); }
  };

  const resetOwnerPassword = async (password, remember = true) => {
    setLoading(true);
    try {
      const response = await fetch('/api/ponto-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'ownerReset', password, remember }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível redefinir o acesso principal.');
      applySession(data);
      toast({ title: 'Senha administrativa redefinida', description: 'As sessões anteriores foram encerradas e o novo acesso já está ativo.' });
      return { success: true };
    } catch (error) {
      toast({ title: 'Não foi possível redefinir', description: error.message, variant: 'destructive' });
      return { success: false, error };
    } finally { setLoading(false); }
  };

  const logout = async () => {
    try { await fetch('/api/ponto-auth', { method: 'DELETE', credentials: 'include' }); } finally { setUser(null); setUserProfile(null); window.location.href = '/ponto-dimivig/index.html'; }
  };

  const value = {
    user,
    userProfile,
    loading,
    login,
    bootstrap,
    logout,
    refreshProfile: checkSession,
    isAuthenticated: !!user,
    isAdmin: userProfile?.perfil === 'Administrador',
    isFiscal: userProfile?.perfil === 'Fiscal',
    isColaborador: userProfile?.perfil === 'Colaborador',
    isCliente: userProfile?.perfil === 'Cliente',
    isOfflineMode: false,
    needsSetup,
    canBootstrap,
    canOwnerRecover,
    ownerLogin,
    mustChangePassword,
    changePassword,
    resetOwnerPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
