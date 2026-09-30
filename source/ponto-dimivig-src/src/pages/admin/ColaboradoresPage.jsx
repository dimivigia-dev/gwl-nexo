import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import MainLayout from '@/components/layout/MainLayout';
import BackButton from '@/components/common/BackButton';
import { Button } from '@/components/ui/button';
import { Plus, Search, Download, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { displayDate, downloadCsv, loadPonto, updatePonto } from '@/services/pontoApi';
import { useToast } from '@/components/ui/use-toast';

const ColaboradoresPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [colaboradores, setColaboradores] = useState([]);
  const [sites, setSites] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [site, setSite] = useState('');
  const refresh = async () => {
    try { const data = await loadPonto(); setColaboradores(data.employees || []); setSites(data.sites || []); }
    catch (error) { toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' }); }
  };
  useEffect(() => { refresh(); }, []);
  const filtered = useMemo(() => {
    const term = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return colaboradores.filter((item) => {
      const searchable = [item.name, item.registration, item.cpf, item.site_name, item.job_title, item.email]
        .filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return (!status || item.status === status) && (!site || String(item.site_id) === site) && (!term || searchable.includes(term));
    });
  }, [colaboradores, query, site, status]);
  const toggleStatus = async (item) => {
    try { await updatePonto('employee', item.id, { status: item.status === 'active' ? 'inactive' : 'active' }); await refresh(); }
    catch (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); }
  };
  const exportEmployees = () => downloadCsv('colaboradores-ponto-dimivig.csv', [
    ['ID', 'Colaborador', 'Status', 'Posto', 'Matrícula', 'CPF', 'Cargo', 'Jornada'],
    ...filtered.map((c) => [c.id, c.name, c.status, c.site_name, c.registration, c.cpf, c.job_title, c.schedule]),
  ]);

  return (
    <>
      <Helmet><title>Colaboradores - Dimivig</title></Helmet>
      <MainLayout>
        <div className="space-y-6">
          <div className="flex flex-col">
             <BackButton />
             <h1 className="text-2xl font-bold text-white mb-6">Colaboradores</h1>
          </div>

          {/* Filter Bar */}
          <div className="bg-[#2a2a2a] p-4 rounded-lg border border-gray-800 flex flex-wrap gap-4">
             <select className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300"><option>Empresa [TODOS]</option></select>
             <select value={site} onChange={(e) => setSite(e.target.value)} className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300"><option value="">Posto [TODOS]</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
             <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300"><option value="">Status [TODOS]</option><option value="active">ATIVOS</option><option value="inactive">INATIVOS</option></select>
             <label className="flex-1 min-w-[260px] flex items-center gap-2 bg-[#1a1a1a] border border-gray-700 rounded px-3 focus-within:border-[#ff8c00]"><Search className="w-4 h-4 text-gray-500"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por nome, matrícula, CPF, posto ou cargo" aria-label="Filtrar colaboradores automaticamente" className="bg-transparent py-2.5 text-sm text-white outline-none w-full placeholder:text-gray-600" />{query && <button type="button" onClick={() => setQuery('')} className="text-gray-500 hover:text-white" aria-label="Limpar filtro"><span aria-hidden="true">×</span></button>}</label>
          </div>

          <div className="flex justify-between items-center">
             <h2 className="text-gray-400 text-sm">Lista de Colaboradores <span className="bg-red-500 text-white px-2 rounded-full text-xs">{filtered.length}</span></h2>
             <div className="flex gap-2">
                <Button onClick={() => navigate('/admin/colaboradores/novo')} className="bg-[#ff8c00] hover:bg-[#e67e00] text-white">
                  <Plus className="w-4 h-4 mr-2"/> Novo Colaborador
                </Button>
                <Button onClick={exportEmployees} variant="outline" className="border-gray-700 text-gray-300">
                  <Download className="w-4 h-4 mr-2"/> Exportar
                </Button>
             </div>
          </div>

          <div className="bg-[#2a2a2a] rounded-lg border border-gray-800 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-500 uppercase bg-[#1f1f1f]">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Colaborador</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Lotação</th>
                    <th className="px-4 py-3">Admissão</th>
                    <th className="px-4 py-3">Matrícula</th>
                    <th className="px-4 py-3">Cargo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                   {filtered.map(colab => (
                     <tr key={colab.id} className="hover:bg-[#333] cursor-pointer" onDoubleClick={() => navigate(`/admin/colaboradores/${colab.id}`)} title="Clique duas vezes para editar">
                        <td className="px-4 py-3 text-blue-400">{colab.id}</td>
                        <td className="px-4 py-3">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                                 <User className="w-4 h-4 text-gray-400" />
                              </div>
                              <button onClick={() => navigate(`/admin/colaboradores/${colab.id}`)} className="font-semibold text-white hover:text-[#ff8c00] text-left">{colab.name}</button>
                           </div>
                        </td>
                        <td className="px-4 py-3"><button onClick={() => toggleStatus(colab)} className={colab.status === 'active' ? 'bg-green-500/20 text-green-500 px-2 py-0.5 rounded text-xs border border-green-500/30' : 'bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs border border-red-500/30'}>{colab.status === 'active' ? 'ATIVO' : 'INATIVO'}</button></td>
                        <td className="px-4 py-3 text-xs">DIMIVIG VIGILÂNCIA</td>
                        <td className="px-4 py-3 text-xs">{colab.site_name || 'SEM POSTO'}</td>
                        <td className="px-4 py-3">{displayDate(colab.created_at)}</td>
                        <td className="px-4 py-3 text-blue-300">{colab.registration}</td>
                        <td className="px-4 py-3 text-xs">{colab.job_title}</td>
                     </tr>
                   ))}
                   {!filtered.length && <tr><td colSpan="8" className="px-4 py-10 text-center text-gray-500">Nenhum colaborador encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  );
};

export default ColaboradoresPage;
