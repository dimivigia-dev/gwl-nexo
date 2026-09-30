import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Clock, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/Logo';

const LoginPage = () => {
  const { login, bootstrap, resetOwnerPassword, user, userProfile, loading, needsSetup, canBootstrap, canOwnerRecover, ownerLogin } = useAuth();
  const navigate = useNavigate();
  const [accessType, setAccessType] = useState('administrativo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (loading || !user || !userProfile) return;
    const redirectMap = { Administrador: '/admin', Fiscal: '/fiscal', Colaborador: '/colaborador', Cliente: '/cliente' };
    navigate(redirectMap[userProfile.perfil] || '/', { replace: true });
  }, [loading, navigate, user, userProfile]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (setupMode || ownerRecoveryMode) {
      if (password !== confirmPassword) { setFormError('A confirmação da senha não confere.'); return; }
      if (password.length < 10) { setFormError('Crie uma senha com pelo menos 10 caracteres.'); return; }
    } else if (!email.trim() || !password) {
      setFormError('Informe seu login e sua senha.'); return;
    }
    setSubmitting(true);
    const result = setupMode
      ? await bootstrap(password, remember)
      : ownerRecoveryMode
        ? await resetOwnerPassword(password, remember)
        : await login(accessType, email.trim(), password, remember);
    setSubmitting(false);
    if (!result?.success) setFormError(result?.error?.message || 'Não foi possível entrar.');
  };

  const isDisabled = loading || submitting;
  const setupMode = needsSetup && canBootstrap && accessType === 'administrativo';
  const ownerRecoveryMode = recoveryMode && canOwnerRecover && accessType === 'administrativo' && !setupMode;

  return <>
    <Helmet><title>Ponto DIMIVIG | GWL NEXO</title><meta name="description" content="Acesso seguro ao sistema Ponto DIMIVIG" /></Helmet>
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#101010] via-[#1a1a1a] to-[#0d0d0d] text-white">
      <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-[#ff8c00]/10 blur-3xl" />
      <div className="absolute -bottom-40 -left-32 h-[420px] w-[420px] rounded-full bg-[#ff8c00]/5 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        <a href="/" className="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-[#171717]/90 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-[#ff8c00] hover:text-[#ff8c00]"><span aria-hidden="true">←</span>Voltar ao GWL NEXO</a>
        <div className="mt-8 grid items-center gap-10 lg:grid-cols-[1.02fr_.98fr]">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }} className="space-y-6">
            <Logo className="h-14 w-auto" />
            <div><h1 className="text-4xl font-bold leading-tight">Ponto DIMIVIG: operação protegida em cada acesso.</h1><p className="mt-4 text-lg text-gray-400">Cada administrador e colaborador entra com credenciais próprias e vê somente o que seu perfil permite.</p></div>
            <div className="grid gap-4">{[
              { icon: ShieldCheck, title: 'Acesso individual e auditável', description: 'Sessão protegida, bloqueio de tentativas e perfis separados.' },
              { icon: Clock, title: 'Ponto completo em um só lugar', description: 'Marcações, folha, justificativas, assinatura e documentos.' },
              { icon: Users, title: 'Gestão por posto e colaborador', description: 'Equipes, escalas e pendências organizadas para o RH.' },
            ].map((feature, index) => <motion.div key={feature.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 + index * .1 }} className="flex items-start gap-4 rounded-xl border border-gray-800 bg-[#161616]/80 p-4"><div className="rounded-lg bg-[#ff8c00]/10 p-2 text-[#ff8c00]"><feature.icon className="h-5 w-5" /></div><div><p className="font-semibold">{feature.title}</p><p className="text-sm text-gray-400">{feature.description}</p></div></motion.div>)}</div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay: .1 }}>
            <div className="rounded-2xl border border-gray-800 bg-[#1f1f1f] p-6 shadow-2xl">
              <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff9f2e]">Acesso ao Ponto DIMIVIG</p><h2 className="mt-2 text-2xl font-semibold">{setupMode ? 'Criar senha do Administrador' : ownerRecoveryMode ? 'Redefinir senha principal' : 'Entrar no sistema'}</h2><p className="mt-2 text-sm leading-relaxed text-gray-400">{setupMode ? 'Este é o primeiro acesso administrativo. Crie sua senha e entre; o colaborador continua disponível na opção ao lado.' : ownerRecoveryMode ? 'Crie uma nova senha para o administrador principal. Todas as sessões administrativas anteriores serão encerradas.' : 'Escolha o perfil e informe seu login e sua senha.'}</p></div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!ownerRecoveryMode && <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de acesso">
                  <button type="button" role="radio" aria-checked={accessType === 'administrativo'} onClick={() => { setAccessType('administrativo'); setRecoveryMode(false); setPassword(''); setConfirmPassword(''); setFormError(''); }} className={`rounded-xl border p-4 text-left transition ${accessType === 'administrativo' ? 'border-[#ff8c00] bg-[#ff8c00]/10 ring-1 ring-[#ff8c00]/30' : 'border-gray-700 bg-[#161616] hover:border-gray-500'}`}><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#ff9f2e]"><ShieldCheck className="h-5 w-5" /></span><span className="min-w-0"><strong className="block text-base text-white">Administrador</strong><small className="mt-1 block text-[11px] leading-relaxed text-gray-400">Gestão completa do sistema.</small></span>{accessType === 'administrativo' && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-[#ff8c00]" />}</div></button>
                  <button type="button" role="radio" aria-checked={accessType === 'colaborador'} onClick={() => { setAccessType('colaborador'); setRecoveryMode(false); setPassword(''); setConfirmPassword(''); setFormError(''); }} className={`rounded-xl border p-4 text-left transition ${accessType === 'colaborador' ? 'border-blue-400 bg-blue-500/10 ring-1 ring-blue-400/30' : 'border-gray-700 bg-[#161616] hover:border-gray-500'}`}><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-300"><Users className="h-5 w-5" /></span><span className="min-w-0"><strong className="block text-base text-white">Colaborador</strong><small className="mt-1 block text-[11px] leading-relaxed text-gray-400">Bater ponto e consultar a folha.</small></span>{accessType === 'colaborador' && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-blue-300" />}</div></button>
                </div>}

                {(setupMode || ownerRecoveryMode) && ownerLogin && <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3"><span className="block text-[10px] font-bold uppercase tracking-[.15em] text-blue-300">Login administrativo principal</span><strong className="mt-1 block text-sm text-white">{ownerLogin}</strong></div>}
                {!setupMode && !ownerRecoveryMode && <label className="block text-sm text-gray-300">E-mail ou login<div className="mt-2 flex items-center gap-2 rounded-xl border border-gray-700 bg-[#161616] px-3 py-3 focus-within:border-[#ff8c00]"><Mail className="h-4 w-4 text-gray-500" /><input autoComplete="username" className="w-full bg-transparent text-sm outline-none placeholder:text-gray-600" placeholder="seu.login@dimivig.com.br" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isDisabled} /></div></label>}
                <label className="block text-sm text-gray-300">{setupMode || ownerRecoveryMode ? 'Nova senha administrativa' : 'Senha'}<div className="mt-2 flex items-center gap-2 rounded-xl border border-gray-700 bg-[#161616] px-3 py-3 focus-within:border-[#ff8c00]"><Lock className="h-4 w-4 text-gray-500" /><input type={showPassword ? 'text' : 'password'} autoComplete={setupMode || ownerRecoveryMode ? 'new-password' : 'current-password'} className="w-full bg-transparent text-sm outline-none placeholder:text-gray-600" placeholder={setupMode || ownerRecoveryMode ? 'Mínimo de 10 caracteres' : 'Digite sua senha'} value={password} onChange={(event) => setPassword(event.target.value)} disabled={isDisabled} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="text-gray-500 hover:text-white" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
                {(setupMode || ownerRecoveryMode) && <label className="block text-sm text-gray-300">Confirmar senha<div className="mt-2 flex items-center gap-2 rounded-xl border border-gray-700 bg-[#161616] px-3 py-3 focus-within:border-[#ff8c00]"><KeyRound className="h-4 w-4 text-gray-500" /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" className="w-full bg-transparent text-sm outline-none" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div></label>}
                <label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="rounded border-gray-600 bg-[#161616] text-[#ff8c00]" />Manter este dispositivo conectado</label>
                {formError && <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{formError}</div>}
                {accessType === 'administrativo' && !setupMode && needsSetup && !canBootstrap && <div className="rounded-lg border border-amber-600/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">O administrador principal ainda precisa ativar o primeiro acesso.</div>}
                <button type="submit" disabled={isDisabled || (accessType === 'administrativo' && needsSetup && !canBootstrap)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff8c00] px-4 py-3 text-sm font-bold text-black transition hover:bg-[#ff9f2e] disabled:cursor-not-allowed disabled:opacity-50">{isDisabled ? <><Loader2 className="h-4 w-4 animate-spin" />Validando...</> : <>{setupMode ? 'Criar senha e entrar' : ownerRecoveryMode ? 'Salvar nova senha e entrar' : accessType === 'administrativo' ? 'Entrar como Administrador' : 'Entrar como Colaborador'}<ArrowRight className="h-4 w-4" /></>}</button>
              </form>
              {accessType === 'administrativo' && !setupMode && canOwnerRecover && <button type="button" onClick={() => { setRecoveryMode(!ownerRecoveryMode); setPassword(''); setConfirmPassword(''); setFormError(''); }} className="mt-4 w-full text-center text-xs font-semibold text-blue-300 transition hover:text-blue-200">{ownerRecoveryMode ? '← Voltar para o login' : 'Esqueci a senha administrativa'}</button>}
              <p className="mt-4 text-center text-[11px] leading-relaxed text-gray-600">{accessType === 'colaborador' ? 'Use o login e a senha fornecidos pela Administração DIMIVIG.' : 'Login principal: dimivigia@gmail.com'}</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  </>;
};

export default LoginPage;
