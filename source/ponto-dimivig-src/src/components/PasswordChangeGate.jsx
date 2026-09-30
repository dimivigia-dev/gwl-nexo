import React, { useState } from 'react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function PasswordChangeGate({ children }) {
  const { user, mustChangePassword, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!user || !mustChangePassword) return children;
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (newPassword.length < 10) return setError('Use pelo menos 10 caracteres na nova senha.');
    if (newPassword !== confirmPassword) return setError('A confirmação da nova senha não confere.');
    setSaving(true);
    try { await changePassword(currentPassword, newPassword); }
    catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/90 p-4 backdrop-blur-md"><form onSubmit={submit} className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-700 bg-[#222] shadow-2xl"><header className="border-b border-gray-700 p-6"><span className="grid h-12 w-12 place-items-center rounded-xl bg-orange-500/10 text-[#ff9f2e]"><ShieldCheck className="h-6 w-6"/></span><h1 className="mt-4 text-2xl font-bold text-white">Proteja seu primeiro acesso</h1><p className="mt-2 text-sm leading-relaxed text-gray-400">A senha provisória precisa ser trocada antes de usar o sistema. A nova senha será conhecida somente por você.</p></header><div className="space-y-4 p-6">{[['Senha provisória',currentPassword,setCurrentPassword],['Nova senha',newPassword,setNewPassword],['Confirmar nova senha',confirmPassword,setConfirmPassword]].map(([label,value,setter])=><label key={label} className="block text-sm text-gray-300">{label}<div className="mt-2 flex items-center gap-2 rounded-xl border border-gray-700 bg-[#171717] px-3 py-3 focus-within:border-[#ff8c00]"><KeyRound className="h-4 w-4 text-gray-500"/><input type="password" value={value} onChange={(event)=>setter(event.target.value)} autoComplete={label==='Senha provisória'?'current-password':'new-password'} className="w-full bg-transparent text-white outline-none"/></div></label>)}{error&&<p className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}<button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff8c00] px-4 py-3 font-bold text-black disabled:opacity-50">{saving?<><Loader2 className="h-4 w-4 animate-spin"/>Salvando...</>:'Trocar senha e continuar'}</button></div></form></div>;
}
