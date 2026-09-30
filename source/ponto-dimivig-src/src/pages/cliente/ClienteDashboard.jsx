import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import MainLayout from '@/components/layout/MainLayout';
import { AlertCircle, Clock, FileText, Users } from 'lucide-react';
import { loadPonto } from '@/services/pontoApi';
import { useAuth } from '@/contexts/AuthContext';

const ClienteDashboard = () => {
  const { userProfile } = useAuth();
  const [data, setData] = useState({ records: [], employees: [], documents: [], justifications: [] });
  useEffect(() => { loadPonto().then(setData).catch(() => {}); }, []);
  const siteId = String(userProfile?.siteId || '');
  const employees = useMemo(() => data.employees.filter((e) => !siteId || String(e.site_id) === siteId), [data.employees, siteId]);
  const employeeIds = new Set(employees.map((e) => String(e.id)));
  const records = data.records.filter((r) => employeeIds.has(String(r.employee_id)));
  const documents = data.documents.filter((d) => !siteId || String(d.site_id) === siteId || employeeIds.has(String(d.employee_id)));
  const pending = data.justifications.filter((j) => employeeIds.has(String(j.employee_id)) && j.status === 'pending');
  const cards = [{ icon: Users, label: 'Colaboradores ativos', value: employees.filter((e) => e.status === 'active').length, color: 'text-[#ff8c00]' }, { icon: Clock, label: 'Registros no mês', value: records.length, color: 'text-blue-400' }, { icon: AlertCircle, label: 'Pendências', value: pending.length, color: 'text-red-400' }, { icon: FileText, label: 'Documentos', value: documents.length, color: 'text-green-400' }];
  return <><Helmet><title>Portal do Cliente - Ponto Dimivig</title></Helmet><MainLayout><div className="space-y-6"><div><h1 className="text-3xl font-bold text-white">Portal do Cliente</h1><p className="text-gray-400 mt-1">Acompanhamento da equipe, ponto e documentos do posto vinculado.</p></div><div className="grid grid-cols-1 md:grid-cols-4 gap-4">{cards.map((card) => <div key={card.label} className="bg-[#2a2a2a] rounded-xl p-6 border border-gray-800"><card.icon className={`w-6 h-6 ${card.color}`}/><p className="text-3xl font-bold text-white mt-4">{card.value}</p><p className="text-sm text-gray-400">{card.label}</p></div>)}</div><div className="bg-[#2a2a2a] rounded-xl border border-gray-800 overflow-hidden"><div className="p-4 border-b border-gray-800"><h2 className="font-semibold text-white">Últimos registros</h2></div><div className="divide-y divide-gray-800">{records.slice(0,30).map((record) => <div key={record.id} className="p-4 grid md:grid-cols-4 gap-2 text-sm"><span className="text-white">{record.employee_name}</span><span className="text-gray-400">{record.site_name || '—'}</span><span className="text-[#ff8c00]">{record.kind.replaceAll('_',' ')}</span><span className="text-gray-400 md:text-right">{new Date(record.recorded_at).toLocaleString('pt-BR')}</span></div>)}{!records.length && <p className="p-8 text-center text-gray-500">Nenhum registro nesta competência.</p>}</div></div></div></MainLayout></>;
};

export default ClienteDashboard;
