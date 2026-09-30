import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Users, Clock, AlertTriangle, Briefcase, Car, FileCheck, Search } from 'lucide-react';
import BackButton from '@/components/common/BackButton';
import { loadPonto, updatePonto } from '@/services/pontoApi';
import { useToast } from '@/components/ui/use-toast';

const AdminDashboard = () => {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState({ records: [], employees: [], sites: [], justifications: [], schedules: [] });
  const refresh = async () => {
    try { setData(await loadPonto()); }
    catch (error) { toast({ title: 'Erro ao carregar o painel', description: error.message, variant: 'destructive' }); }
  };
  useEffect(() => { refresh(); }, []);
  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = useMemo(() => data.records.filter((r) => String(r.recorded_at).slice(0, 10) === today && r.status !== 'invalid'), [data.records, today]);
  const peopleToday = new Set(todayRecords.map((r) => r.employee_id)).size;
  const pending = data.justifications.filter((j) => j.status === 'pending');
  const delays = todayRecords.filter((r) => r.kind === 'entrada' && new Date(r.recorded_at).getHours() >= 8).slice(0, 10).map((r) => ({ comp: new Date(r.recorded_at).toLocaleDateString('pt-BR'), local: r.site_name || 'Sem posto', colab: r.employee_name, ponto: new Date(r.recorded_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}), info: `${String(r.source || 'WEB').toUpperCase()} ${r.accuracy ? `±${r.accuracy}m` : ''}` }));
  const review = async (id, status) => { try { await updatePonto('justification', id, { status }); await refresh(); } catch (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); } };

  const MetricCard = ({ title, icon: Icon, metrics, colorClass = "text-[#ff8c00]" }) => (
    <motion.div 
      whileHover={{ scale: 1.02 }}
      className="bg-[#2a2a2a]/80 backdrop-blur-sm border border-gray-800 rounded-xl p-4 shadow-lg flex flex-col justify-between"
    >
      <div className="flex items-center gap-2 mb-3 border-b border-gray-700 pb-2">
        <Icon className={`w-5 h-5 ${colorClass}`} />
        <h3 className="font-semibold text-gray-200 text-sm">{title}</h3>
      </div>
      <div className="flex justify-around items-center text-center">
        {metrics.map((m, idx) => (
          <div key={idx} className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase font-bold">{m.label}</span>
            <span className={`text-xl md:text-2xl font-bold ${m.color || 'text-white'}`}>
              {m.value}
            </span>
            {m.sub && <span className="text-[10px] text-gray-500">{m.sub}</span>}
          </div>
        ))}
      </div>
    </motion.div>
  );

  return (
    <>
      <Helmet>
        <title>Dashboard Administrativo - Dimivig</title>
      </Helmet>
      <MainLayout>
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
               <BackButton />
               <h1 className="text-2xl md:text-3xl font-bold text-white">Dashboard de <span className="text-[#ff8c00]">Ponto Eletrônico</span></h1>
            </div>
            <div className="bg-[#2a2a2a] p-2 rounded-lg border border-gray-800 flex items-center text-sm text-gray-400">
              <span className="mr-2">{new Date().toLocaleDateString('pt-BR')}</span>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <MetricCard 
              title="Registros de Ponto" 
              icon={Clock} 
              metrics={[
                { label: 'Pessoas', value: peopleToday, color: 'text-purple-400' },
                { label: 'Registros', value: todayRecords.length },
                { label: 'Pendências', value: pending.length, color: 'text-red-500' }
              ]} 
            />
            <MetricCard 
              title="Colaboradores" 
              icon={Users} 
              colorClass="text-green-500"
              metrics={[
                { label: 'Ativos', value: data.employees.filter((e) => e.status === 'active').length, color: 'text-green-400' },
                { label: 'Postos', value: data.sites.filter((s) => s.status === 'active').length, color: 'text-blue-400' },
                { label: 'Inativos', value: data.employees.filter((e) => e.status === 'inactive').length, color: 'text-red-400' }
              ]} 
            />
            <MetricCard 
              title="Admissões" 
              icon={Briefcase} 
              colorClass="text-blue-500"
              metrics={[
                { label: 'Recentes', value: data.employees.filter((e) => String(e.created_at).slice(0, 7) === new Date().toISOString().slice(0, 7)).length, color: 'text-white' },
                { label: 'PCD', value: '0', color: 'text-blue-400' }
              ]} 
            />
            <MetricCard 
              title="Prestadores" 
              icon={FileCheck} 
              colorClass="text-cyan-500"
              metrics={[
                { label: 'Escalas', value: data.schedules.length },
                { label: 'Postos', value: data.sites.length }
              ]} 
            />
            <MetricCard 
              title="Veículos" 
              icon={Car} 
              colorClass="text-yellow-500"
              metrics={[
                { label: 'Fotos', value: todayRecords.filter((r) => r.photo_key).length },
                { label: 'Sem foto', value: todayRecords.filter((r) => !r.photo_key).length }
              ]} 
            />
          </div>

          {/* Justifications & Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-[#2a2a2a] rounded-xl border border-gray-800 shadow-lg overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  Justificativas Pendentes <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{pending.length}</span>
                </h3>
                <button className="text-[#ff8c00] hover:text-white"><Search className="w-4 h-4" /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-400">
                  <thead className="text-xs text-gray-500 uppercase bg-[#1f1f1f]">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Competência</th>
                      <th className="px-4 py-3">Local</th>
                      <th className="px-4 py-3">Colaborador</th>
                      <th className="px-4 py-3">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {pending.map((row) => (
                      <tr key={row.id} className="hover:bg-[#333] transition-colors">
                        <td className="px-4 py-3 text-blue-400 font-mono">{row.id}</td>
                        <td className="px-4 py-3 text-blue-300">{new Date(`${row.occurrence_date}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                        <td className="px-4 py-3">Ponto eletrônico</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-white font-medium">{row.employee_name}</span>
                            <span className="text-xs">Vigilante</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end">
                             <span>{row.kind}</span>
                             <span className="text-[10px] text-gray-500">{row.reason}</span>
                             <span className="mt-1 flex gap-2"><button onClick={() => review(row.id, 'approved')} className="text-green-400">Aprovar</button><button onClick={() => review(row.id, 'rejected')} className="text-red-400">Recusar</button></span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!pending.length && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500">Nenhuma justificativa pendente.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-[#2a2a2a] rounded-xl border border-gray-800 shadow-lg p-4 flex flex-col">
               <h3 className="font-semibold text-white mb-4">Análise por Tipo</h3>
               <div className="flex-1 flex items-center justify-center relative">
                  <div className="w-48 h-48 rounded-full border-[16px] border-[#ff8c00] border-r-blue-500 border-b-green-500 border-l-purple-500 relative flex items-center justify-center">
                     <div className="text-center">
                        <span className="text-3xl font-bold text-white">{todayRecords.length}</span>
                        <p className="text-xs text-gray-400">Total</p>
                     </div>
                  </div>
               </div>
               <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#ff8c00]"></div> Entrada</div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Saída</div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500"></div> Intrajornada</div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-500"></div> Outros</div>
               </div>
            </div>
          </div>

          {/* Delays Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#2a2a2a] rounded-xl border border-gray-800 shadow-lg overflow-hidden">
               <div className="p-4 border-b border-gray-700">
                 <h3 className="font-semibold text-white flex items-center gap-2">
                    Atraso na Entrada <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{delays.length}</span>
                 </h3>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left text-gray-400">
                   <thead className="text-xs text-gray-500 uppercase bg-[#1f1f1f]">
                     <tr>
                       <th className="px-4 py-3">Data</th>
                       <th className="px-4 py-3">Colaborador</th>
                       <th className="px-4 py-3">Ponto</th>
                       <th className="px-4 py-3">Info</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-800">
                      {delays.map((d, i) => (
                        <tr key={i} className="hover:bg-[#333]">
                           <td className="px-4 py-3 text-blue-300">{d.comp}</td>
                           <td className="px-4 py-3">
                              <span className="text-white block">{d.colab}</span>
                              <span className="text-xs text-gray-500">{d.local}</span>
                           </td>
                           <td className="px-4 py-3 text-red-400 font-bold">{d.ponto}</td>
                           <td className="px-4 py-3 text-xs">{d.info}</td>
                        </tr>
                      ))}
                   </tbody>
                 </table>
               </div>
            </div>
            
            <div className="bg-[#2a2a2a] rounded-xl border border-gray-800 shadow-lg p-6 flex items-center justify-center text-gray-500 flex-col">
               <AlertTriangle className="w-12 h-12 mb-2 text-[#ff8c00] opacity-50" />
               <p>Mais dados de atrasos indisponíveis no momento.</p>
            </div>
          </div>

        </div>
      </MainLayout>
    </>
  );
};

export default AdminDashboard;
