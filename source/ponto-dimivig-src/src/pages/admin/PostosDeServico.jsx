import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import MainLayout from '@/components/layout/MainLayout';
import BackButton from '@/components/common/BackButton';
import { Button } from '@/components/ui/button';
import { Save, X, MapPin, ShieldCheck, Search } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { createPonto, loadPonto, updatePonto } from '@/services/pontoApi';

const Input = ({ label, name, value, onChange, type = 'text', required, wrapperClassName = '', ...props }) => (
  <div className={`flex flex-col gap-1 ${wrapperClassName}`}>
    <label className="text-xs font-medium text-gray-400">{label} {required && <span className="text-red-500">*</span>}</label>
    <input type={type} name={name} value={value} onChange={onChange} className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-[#ff8c00] focus:ring-1 focus:ring-[#ff8c00] outline-none" {...props} />
  </div>
);

const Select = ({ label, name, value, onChange, options, required }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-gray-400">{label} {required && <span className="text-red-500">*</span>}</label>
    <select name={name} value={value} onChange={onChange} className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-[#ff8c00] focus:ring-1 focus:ring-[#ff8c00] outline-none">
      <option value="">Selecione...</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </div>
);

const Toggle = ({ label, name, value, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-gray-400">{label}</label>
    <select name={name} value={value ? 'SIM' : 'NÃO'} onChange={(event) => onChange(name, event.target.value === 'SIM')} className="bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-[#ff8c00] outline-none">
      <option value="SIM">SIM</option><option value="NÃO">NÃO</option>
    </select>
  </div>
);

const PostosDeServico = () => {
  const { toast } = useToast();
  const [postos, setPostos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Usuários');
  const [formData, setFormData] = useState({
    empresa: '', tipoPosto: '', estoque: '', cnpj: '', razao: '', apelido: '',
    cerca: '300', status: 'ATIVO', apoio: false, rotativo: false,
    assinaArquivos: false, livroOcorrencia: false, controleAtiv: '',
    responsavel: '', telefone: '', email: '', lat: '', long: '', cep: '', endereco: '',
    numero: '', complemento: ''
  });

  const refresh = async () => {
    try {
      const data = await loadPonto();
      setPostos(data.sites || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    }
  };

  useEffect(() => { refresh(); }, []);

  const filteredPostos = useMemo(() => {
    const term = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!term) return postos;
    return postos.filter((posto) => [posto.name, posto.contract, posto.city, posto.responsible, posto.company, posto.cnpj]
      .filter(Boolean)
      .join(' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .includes(term));
  }, [postos, query]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.razao || !formData.apelido || !formData.lat || !formData.long) {
      toast({ title: 'Erro', description: 'Preencha nome, apelido e coordenadas do posto para liberar o ponto seguro.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createPonto('site', {
        name: formData.apelido,
        contract: formData.razao,
        city: formData.endereco,
        responsible: formData.responsavel,
        company: formData.empresa,
        cnpj: formData.cnpj,
        siteType: formData.tipoPosto,
        phone: formData.telefone,
        email: formData.email,
        address: formData.endereco,
        addressNumber: formData.numero,
        zipCode: formData.cep,
        rotating: formData.rotativo,
        requirePhoto: true,
        requireGeo: true,
        notes: formData.complemento,
        latitude: formData.lat,
        longitude: formData.long,
        radiusMeters: Number(formData.cerca || 0) || 300,
        status: formData.status === 'INATIVO' ? 'inactive' : 'active',
      });
      toast({ title: 'Sucesso', description: 'Posto de serviço salvo no banco.' });
      setFormData(prev => ({ ...prev, razao: '', apelido: '', responsavel: '', endereco: '', lat: '', long: '' }));
      await refresh();
    } catch (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const toggleStatus = async (posto) => {
    try {
      await updatePonto('site', posto.id, { status: posto.status === 'active' ? 'inactive' : 'active' });
      await refresh();
    } catch (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); }
  };

  return (
    <>
      <Helmet><title>Postos de Serviço - Dimivig</title></Helmet>
      <MainLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <BackButton />
              <h1 className="text-2xl font-bold text-white">Postos de Serviço</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="text-gray-400 border-gray-700 hover:text-white hover:bg-gray-800">
                <X className="w-4 h-4 mr-2" /> Cancelar
              </Button>
              <Button disabled={saving} onClick={handleSubmit} className="bg-[#ff8c00] hover:bg-[#e67e00] text-white">
                <Save className="w-4 h-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>

          <form className="bg-[#2a2a2a] p-6 rounded-lg border border-gray-800 shadow-xl space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select label="Empresa" name="empresa" value={formData.empresa} onChange={handleChange} options={['Dimivig Segurança', 'Dimivig Serviços']} />
              <Select label="Tipo de Posto" name="tipoPosto" value={formData.tipoPosto} onChange={handleChange} options={['Armado', 'Desarmado', 'Limpeza']} />
              <Select label="Estoque" name="estoque" value={formData.estoque} onChange={handleChange} options={['Geral', 'Local']} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               <Input label="CNPJ" name="cnpj" value={formData.cnpj} onChange={handleChange} placeholder="00.000.000/0000-00" />
               <Input label="Nome - Razão / Lotação" name="razao" value={formData.razao} onChange={handleChange} required />
               <Input label="Apelido" name="apelido" value={formData.apelido} onChange={handleChange} required />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               <Input label="Raio permitido (metros)" name="cerca" value={formData.cerca} onChange={handleChange} type="number" min="20" step="10" />
               <Select label="Status" name="status" value={formData.status} onChange={handleChange} options={['ATIVO', 'INATIVO']} required />
               <Toggle label="Apoio?" name="apoio" value={formData.apoio} onChange={(name, checked) => setFormData((prev) => ({ ...prev, [name]: checked }))} />
               <Toggle label="Rotativo?" name="rotativo" value={formData.rotativo} onChange={(name, checked) => setFormData((prev) => ({ ...prev, [name]: checked }))} />
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4 text-sm text-emerald-200"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/><div><strong className="block text-white">Ponto protegido</strong>Todos os registros exigem foto tirada na hora e GPS dentro do raio configurado. Latitude e longitude são obrigatórias.</div></div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Responsável" name="responsavel" value={formData.responsavel} onChange={handleChange} />
                <Input label="Telefone" name="telefone" value={formData.telefone} onChange={handleChange} />
                <Input label="E-mail" name="email" value={formData.email} onChange={handleChange} type="email" />
             </div>

             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input label="CEP" name="cep" value={formData.cep} onChange={handleChange} />
                <Input label="Endereço" name="endereco" value={formData.endereco} onChange={handleChange} wrapperClassName="md:col-span-2" />
                <Input label="Número" name="numero" value={formData.numero} onChange={handleChange} />
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Latitude do posto" name="lat" value={formData.lat} onChange={handleChange} required placeholder="-16.6869" />
                <Input label="Longitude do posto" name="long" value={formData.long} onChange={handleChange} required placeholder="-49.2648" />
                <div className="rounded-lg border border-gray-700 bg-[#1a1a1a] p-3 text-xs text-gray-400"><MapPin className="mr-1 inline h-4 w-4 text-[#ff8c00]"/>Use o ponto central do local de trabalho.</div>
             </div>

             {/* Seção de vínculos do posto */}
             <div className="border-t border-gray-700 pt-4">
               <div className="flex gap-4 border-b border-gray-700 mb-4">
                 {['Usuários', 'Colaboradores', 'Check-List', 'Contratos', 'Observações'].map((tab) => (
                   <button 
                     key={tab}
                     type="button"
                     onClick={() => setActiveTab(tab)}
                     className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-[#ff8c00] text-[#ff8c00]' : 'border-transparent text-gray-400 hover:text-white'}`}
                   >
                     {tab}
                   </button>
                 ))}
               </div>
               <div className="min-h-32 p-4 text-gray-400 text-sm border border-gray-700 rounded bg-[#1a1a1a]">
                 {activeTab === 'Usuários' && <p>Responsável: <span className="text-white">{formData.responsavel || 'não informado'}</span> · {formData.email || 'sem e-mail'} · {formData.telefone || 'sem telefone'}</p>}
                 {activeTab === 'Colaboradores' && <p>Após salvar o posto, vincule colaboradores pela tela <span className="text-[#ff8c00]">Colaboradores</span>. O vínculo aparecerá automaticamente nos relatórios.</p>}
                 {activeTab === 'Check-List' && <div className="grid grid-cols-2 gap-2"><span>Foto: obrigatória</span><span>Geolocalização: obrigatória</span><span>Raio: {formData.cerca || 300} metros</span><span>Rotativo: {formData.rotativo ? 'sim' : 'não'}</span></div>}
                 {activeTab === 'Contratos' && <p>Contrato/lotação: <span className="text-white">{formData.razao || 'não informado'}</span> · Empresa: {formData.empresa || 'não informada'}</p>}
                 {activeTab === 'Observações' && <textarea name="complemento" value={formData.complemento} onChange={handleChange} placeholder="Observações do posto" className="w-full h-20 bg-[#111] border border-gray-700 rounded p-3 text-white outline-none focus:border-[#ff8c00]"/>}
               </div>
             </div>
          </form>

          <div className="bg-[#2a2a2a] rounded-lg border border-gray-800 overflow-hidden shadow-lg">
            <div className="p-4 border-b border-gray-800 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><h2 className="font-semibold text-white flex items-center gap-2"><MapPin className="w-4 h-4 text-[#ff8c00]" /> Postos cadastrados</h2><span className="text-xs text-gray-500">{filteredPostos.length} de {postos.length} registro(s)</span></div>
              <label className="flex min-w-[320px] items-center gap-2 rounded-lg border border-gray-700 bg-[#1a1a1a] px-3 focus-within:border-[#ff8c00]">
                <Search className="h-4 w-4 text-gray-500" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar por posto, contrato, local ou responsável" aria-label="Filtrar postos automaticamente" className="w-full bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-gray-600" />
                {query && <button type="button" onClick={() => setQuery('')} className="text-gray-500 hover:text-white" aria-label="Limpar filtro"><X className="h-4 w-4" /></button>}
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-500 uppercase bg-[#1f1f1f]"><tr><th className="px-4 py-3">Posto</th><th className="px-4 py-3">Contrato</th><th className="px-4 py-3">Local</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredPostos.map((posto) => <tr key={posto.id} className="hover:bg-[#333]"><td className="px-4 py-3 font-semibold text-white">{posto.name}</td><td className="px-4 py-3">{posto.contract || '—'}</td><td className="px-4 py-3">{posto.city || '—'}</td><td className="px-4 py-3">{posto.responsible || '—'}</td><td className="px-4 py-3"><button onClick={() => toggleStatus(posto)} className={posto.status === 'active' ? 'text-green-400' : 'text-red-400'}>{posto.status === 'active' ? 'ATIVO' : 'INATIVO'}</button></td></tr>)}
                  {!filteredPostos.length && <tr><td colSpan="5" className="px-4 py-10 text-center text-gray-500">{postos.length ? 'Nenhum posto corresponde ao filtro.' : 'Nenhum posto cadastrado.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  );
};

export default PostosDeServico;
