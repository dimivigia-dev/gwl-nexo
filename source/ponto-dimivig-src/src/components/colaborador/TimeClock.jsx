import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Camera, CheckCircle2, Coffee, LocateFixed, LogIn, LogOut, MapPin, RefreshCw, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import CameraCapture from './CameraCapture';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { createPonto, fileToDataUrl, loadPonto } from '@/services/pontoApi';

const toRadians = (value) => (value * Math.PI) / 180;
const distanceMeters = (aLat, aLng, bLat, bLng) => {
  const earth = 6371000;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
};

const emptyGeo = { status: 'idle', lat: null, lng: null, accuracy: 0, distance: null, within: false, checkedAt: 0, message: 'Confira sua localização antes de registrar' };

const TimeClock = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastAction, setLastAction] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [geo, setGeo] = useState(emptyGeo);
  const { toast } = useToast();
  const { userProfile } = useAuth();

  useEffect(() => {
    loadPonto().then((data) => {
      const active = (data.employees || []).filter((item) => item.status === 'active');
      setEmployees(active);
      setSites(data.sites || []);
      const stored = String(userProfile?.employeeId || localStorage.getItem('dimivig_employee_id') || '');
      const selected = active.find((item) => String(item.id) === stored) || (userProfile?.perfil === 'Administrador' ? active[0] : null);
      if (selected) setEmployeeId(String(selected.id));
      const own = (data.records || []).filter((record) => String(record.employee_id) === String(selected?.id));
      if (own[0]) setLastAction(own[0].kind);
    }).catch(() => {});
  }, [userProfile?.employeeId, userProfile?.perfil]);

  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);
  const employee = useMemo(() => employees.find((item) => String(item.id) === employeeId), [employees, employeeId]);
  const site = useMemo(() => sites.find((item) => String(item.id) === String(employee?.site_id)), [sites, employee?.site_id]);
  useEffect(() => { setGeo(emptyGeo); }, [employeeId]);

  const getLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este aparelho não oferece localização por GPS.'));
    setGeo((value) => ({ ...value, status: 'loading', message: 'Conferindo GPS e cerca do posto...' }));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: Math.round(position.coords.accuracy || 0) }),
      () => reject(new Error('Ative a localização precisa e autorize o acesso ao GPS.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 },
    );
  });

  const validateLocation = async () => {
    if (!employee) throw new Error('Selecione o colaborador vinculado.');
    if (!site) throw new Error('O colaborador precisa estar vinculado a um posto.');
    const siteLat = Number(site.latitude);
    const siteLng = Number(site.longitude);
    if (!Number.isFinite(siteLat) || !Number.isFinite(siteLng) || (!siteLat && !siteLng)) throw new Error('O posto ainda não possui latitude e longitude cadastradas.');
    try {
      const location = await getLocation();
      const distance = Math.round(distanceMeters(location.lat, location.lng, siteLat, siteLng));
      const radius = Number(site.radius_meters || 300);
      const within = distance <= radius;
      const next = { ...location, distance, within, checkedAt: Date.now(), status: within ? 'valid' : 'outside', message: within ? `Dentro da cerca · ${distance} m do posto` : `Fora da cerca · ${distance} m do posto` };
      setGeo(next);
      if (!within) throw new Error(`Você está a ${distance} m do posto; o limite é ${radius} m.`);
      return next;
    } catch (error) {
      setGeo((value) => ({ ...value, status: 'error', within: false, message: error.message }));
      throw error;
    }
  };

  const handleActionClick = async (action) => {
    try {
      if (!navigator.onLine) throw new Error('O registro com foto e cerca precisa de conexão para validação.');
      await validateLocation();
      setSelectedAction(action);
      setShowCamera(true);
    } catch (error) { toast({ title: 'Registro bloqueado', description: error.message, variant: 'destructive' }); }
  };

  const handlePhotoCapture = async (photoBlob) => {
    try {
      setSaving(true);
      const currentGeo = Date.now() - geo.checkedAt > 120000 ? await validateLocation() : geo;
      if (!currentGeo.within) throw new Error('Confira novamente sua localização dentro da cerca.');
      await createPonto('record', { employeeId, kind: selectedAction, recordedAt: new Date().toISOString(), latitude: currentGeo.lat, longitude: currentGeo.lng, accuracy: currentGeo.accuracy, photoDataUrl: await fileToDataUrl(photoBlob) });
      setLastAction(selectedAction);
      setShowCamera(false);
      localStorage.setItem('dimivig_employee_id', employeeId);
      window.dispatchEvent(new Event('dimivig:ponto-updated'));
      toast({ title: 'Ponto registrado', description: 'Foto, horário e localização foram validados com sucesso.' });
    } catch (error) { toast({ title: 'Não foi possível registrar', description: error.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const actions = [
    { type: 'entrada', icon: LogIn, label: 'Entrada', color: 'from-emerald-600 to-emerald-500' },
    { type: 'saida_intervalo', icon: Coffee, label: 'Saída intervalo', color: 'from-amber-600 to-amber-500' },
    { type: 'retorno_intervalo', icon: ArrowRight, label: 'Retorno intervalo', color: 'from-blue-600 to-blue-500' },
    { type: 'saida', icon: LogOut, label: 'Saída', color: 'from-red-600 to-red-500' },
  ];

  if (showCamera) return <CameraCapture onCapture={handlePhotoCapture} onCancel={() => setShowCamera(false)} actionType={selectedAction} />;

  return <motion.section initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="overflow-hidden rounded-2xl border border-gray-800 bg-[#252525] shadow-2xl">
    <header className="flex flex-col gap-3 border-b border-gray-800 bg-gradient-to-r from-[#222] to-[#29231e] p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#ff9f2e]">Registro seguro</p><h2 className="mt-1 text-2xl font-bold text-white">Bater ponto</h2><p className="mt-1 text-sm text-gray-400">Foto ao vivo, GPS preciso e validação da cerca em uma única etapa.</p></div><div className="rounded-xl border border-gray-700 bg-[#171717] px-5 py-3 text-right"><strong className="block text-3xl text-white">{currentTime.toLocaleTimeString('pt-BR')}</strong><span className="text-xs capitalize text-gray-400">{currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div></header>
    <div className="grid gap-5 p-5 lg:grid-cols-[.8fr_1.2fr]">
      <div className="space-y-4">
        <label className="block text-xs font-medium text-gray-400">Colaborador vinculado<select disabled={userProfile?.perfil === 'Colaborador'} value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); localStorage.setItem('dimivig_employee_id', event.target.value); }} className="mt-1 w-full rounded-lg border border-gray-700 bg-[#171717] px-3 py-3 text-sm text-white outline-none focus:border-[#ff8c00] disabled:opacity-70"><option value="">Selecione seu cadastro...</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.registration}</option>)}</select></label>
        <div className={`rounded-xl border p-4 ${geo.status === 'valid' ? 'border-emerald-800/60 bg-emerald-950/20' : geo.status === 'outside' || geo.status === 'error' ? 'border-red-800/60 bg-red-950/20' : 'border-gray-700 bg-[#191919]'}`}><div className="flex items-start gap-3">{geo.status === 'valid' ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" /> : geo.status === 'outside' || geo.status === 'error' ? <ShieldAlert className="mt-0.5 h-5 w-5 text-red-400" /> : <MapPin className="mt-0.5 h-5 w-5 text-[#ff9f2e]" />}<div className="min-w-0 flex-1"><strong className="block text-sm text-white">{site?.name || 'Posto não configurado'}</strong><span className="mt-1 block text-xs text-gray-400">{geo.message}</span>{geo.accuracy > 0 && <small className="mt-1 block text-gray-500">Precisão: {geo.accuracy} m · limite: {site?.radius_meters || 300} m</small>}</div></div><button onClick={() => validateLocation().catch((error) => toast({ title: 'Localização não validada', description: error.message, variant: 'destructive' }))} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-[#ff8c00] hover:text-[#ff9f2e]"><RefreshCw className={`h-3.5 w-3.5 ${geo.status === 'loading' ? 'animate-spin' : ''}`} />Conferir GPS agora</button></div>
        {lastAction && <div className="rounded-lg border border-gray-700 bg-[#191919] p-3 text-center text-sm text-gray-300">Último registro: <b className="capitalize text-[#ff9f2e]">{lastAction.replaceAll('_', ' ')}</b></div>}
      </div>
      <div className="grid grid-cols-2 gap-3">{actions.map((action) => <motion.div key={action.type} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}><Button onClick={() => handleActionClick(action.type)} disabled={saving || geo.status === 'loading'} className={`h-full min-h-32 w-full rounded-xl bg-gradient-to-br ${action.color} text-white shadow-lg hover:opacity-95`}><div className="flex flex-col items-center gap-2"><span className="rounded-full bg-black/15 p-3"><action.icon className="h-6 w-6" /></span><strong>{action.label}</strong><small className="flex items-center gap-1 opacity-80"><Camera className="h-3 w-3" /><LocateFixed className="h-3 w-3" />Foto + GPS</small></div></Button></motion.div>)}</div>
    </div>
  </motion.section>;
};

export default TimeClock;
