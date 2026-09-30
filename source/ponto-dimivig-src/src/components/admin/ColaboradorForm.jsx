import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { Save, X, User, Briefcase, DollarSign, Phone, Settings, AlertCircle } from 'lucide-react';
import { createPonto, loadPonto, updatePonto } from '@/services/pontoApi';

const FormContext = createContext(null);

const SectionTitle = ({ icon: Icon, title }) => (
  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-700 mt-6"><Icon className="w-5 h-5 text-[#ff8c00]" /><h3 className="text-lg font-semibold text-white">{title}</h3></div>
);

const InputField = ({ label, name, type = 'text', required = false, colSpan = 1 }) => {
  const { formData, handleChange } = useContext(FormContext);
  return <div className={`col-span-1 ${colSpan === 2 ? 'md:col-span-2' : ''}`}><label className="block text-xs font-medium text-gray-400 mb-1">{label} {required && <span className="text-red-500">*</span>}</label><input type={type} name={name} value={formData[name] || ''} onChange={handleChange} className="w-full bg-[#1a1a1a] border border-gray-700 rounded p-2 text-sm text-white focus:border-[#ff8c00] focus:ring-1 focus:ring-[#ff8c00] outline-none transition-colors" /></div>;
};

const SelectField = ({ label, name, options, required = false }) => {
  const { formData, handleChange } = useContext(FormContext);
  return <div><label className="block text-xs font-medium text-gray-400 mb-1">{label} {required && <span className="text-red-500">*</span>}</label><select name={name} value={formData[name] || ''} onChange={handleChange} className="w-full bg-[#1a1a1a] border border-gray-700 rounded p-2 text-sm text-white focus:border-[#ff8c00] focus:ring-1 focus:ring-[#ff8c00] outline-none transition-colors"><option value="">SELECIONE...</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>;
};

const ColaboradorForm = ({ initialData, isEditMode }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sites, setSites] = useState([]);
  
  const [formData, setFormData] = useState({
    empresa: '',
    posto: '',
    nome: '',
    dataNascimento: '',
    sexo: '',
    cargo: '',
    dataAdmissao: '',
    jornada: '',
    horarioEntrada: '06:00',
    horarioIntervaloInicio: '12:00',
    horarioIntervaloFim: '13:00',
    horarioSaida: '18:00',
    matricula: '',
    cpf: '',
    inicioJornada: '',
    ultPeriodo: '',
    ctpsNumero: '',
    ctpsSerie: '',
    pisPasep: '',
    rgOrgao: '',
    rgData: '',
    epcd: 'NAO',
    tipoDeficiencia: '',
    nomeMae: '',
    altura: '',
    peso: '',
    permiteEventos: 'NAO',
    registraPonto: 'SIM',
    permiteMobile: 'SIM',
    registrosForaCerca: 'NAO',
    registrosSemGeo: 'NAO',
    registrosSemFoto: 'NAO',
    registrosSemBio: 'NAO',
    loginSignOn: '',
    sindicato: '',
    salario: '',
    complemento: '',
    extra: '',
    whatsapp: '',
    email: ''
  });

  useEffect(() => {
    if (initialData) {
      setFormData({ ...formData, ...initialData });
    }
  }, [initialData]);

  useEffect(() => {
    loadPonto().then((data) => setSites((data.sites || []).filter((site) => site.status === 'active'))).catch(() => {});
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.nome || !formData.cpf || !formData.matricula) {
      toast({
        title: 'Erro de Validação',
        description: 'Por favor, preencha os campos obrigatórios (Nome, CPF, Matrícula).',
        variant: 'destructive'
      });
      return;
    }

    try {
      const payload = {
        name: formData.nome,
        registration: formData.matricula,
        cpf: formData.cpf,
        jobTitle: formData.cargo,
        siteId: formData.posto,
        schedule: formData.jornada,
        admissionDate: formData.dataAdmissao,
        journeyStartDate: formData.inicioJornada,
        ctpsNumber: formData.ctpsNumero,
        ctpsSeries: formData.ctpsSerie,
        pisPasep: formData.pisPasep,
        expectedStart: formData.horarioEntrada,
        expectedBreakStart: formData.horarioIntervaloInicio,
        expectedBreakEnd: formData.horarioIntervaloFim,
        expectedEnd: formData.horarioSaida,
        registersPoint: formData.registraPonto !== 'NAO',
        email: formData.email,
        phone: formData.whatsapp,
        requirePhoto: true,
        requireGeo: true,
        status: formData.status || 'active',
      };
      if (isEditMode && initialData?.id) await updatePonto('employee', initialData.id, payload);
      else await createPonto('employee', payload);
      toast({
        title: 'Sucesso!',
        description: `Colaborador ${isEditMode ? 'atualizado' : 'cadastrado'} com sucesso.`,
      });
      navigate('/admin/colaboradores');
    } catch (error) {
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao salvar colaborador.',
        variant: 'destructive'
      });
    }
  };


  return (
    <FormContext.Provider value={{ formData, handleChange }}>
    <motion.form 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="bg-[#2a2a2a] p-6 rounded-lg border border-gray-800 shadow-xl"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">
          {isEditMode ? 'Editar Colaborador' : 'Novo Colaborador'}
        </h2>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/colaboradores')} className="border-gray-600 text-gray-300 hover:bg-gray-800">
            <X className="w-4 h-4 mr-2" /> Cancelar
          </Button>
          <Button type="submit" className="bg-[#ff8c00] hover:bg-[#ff9d1f] text-white">
            <Save className="w-4 h-4 mr-2" /> Salvar
          </Button>
        </div>
      </div>

      <SectionTitle icon={User} title="Informações Pessoais" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SelectField label="Empresa" name="empresa" options={['Dimivig Segurança', 'Dimivig Serviços']} required />
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Posto de Serviço <span className="text-red-500">*</span></label>
          <select name="posto" value={formData.posto || ''} onChange={handleChange} className="w-full bg-[#1a1a1a] border border-gray-700 rounded p-2 text-sm text-white focus:border-[#ff8c00] outline-none">
            <option value="">SELECIONE...</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </div>
        <InputField label="Nome do Colaborador" name="nome" colSpan={2} required />
        
        <InputField label="Data de Nascimento" name="dataNascimento" type="date" />
        <SelectField label="Sexo" name="sexo" options={['Masculino', 'Feminino']} />
        <SelectField label="Cargo" name="cargo" options={['Vigilante', 'Porteiro', 'Supervisor']} required />
        <InputField label="Data de Admissão" name="dataAdmissao" type="date" required />
        
        <SelectField label="Jornada" name="jornada" options={['12x36', '44h Semanais', 'Personalizada']} required />
        <InputField label="Matrícula" name="matricula" required />
        <InputField label="CPF" name="cpf" required />
        <InputField label="Início na Jornada" name="inicioJornada" type="date" />

        <InputField label="Entrada Prevista" name="horarioEntrada" type="time" />
        <InputField label="Início do Intervalo" name="horarioIntervaloInicio" type="time" />
        <InputField label="Fim do Intervalo" name="horarioIntervaloFim" type="time" />
        <InputField label="Saída Prevista" name="horarioSaida" type="time" />
        
        <InputField label="CTPS Número" name="ctpsNumero" />
        <InputField label="CTPS Série" name="ctpsSerie" />
        <InputField label="PIS/Pasep" name="pisPasep" />
        <InputField label="RG - Data Emissão" name="rgData" type="date" />
        
        <SelectField label="É PCD?" name="epcd" options={['SIM', 'NAO']} />
        <SelectField label="Tipo Deficiência" name="tipoDeficiencia" options={['Visual', 'Auditiva', 'Motora', 'Intelectual']} />
        <SelectField label="Permite Eventos?" name="permiteEventos" options={['SIM', 'NAO']} />
      </div>

      <SectionTitle icon={Settings} title="Configurações do Ponto" />
      <div className="mb-4 rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-3 text-sm text-emerald-200">Por segurança, o ponto mobile deste colaborador sempre exigirá foto feita na hora e GPS dentro da cerca do posto.</div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SelectField label="Registra Ponto?" name="registraPonto" options={['SIM', 'NAO']} />
        <SelectField label="Permite Mobile?" name="permiteMobile" options={['SIM', 'NAO']} />
        <SelectField label="Login Sign-On" name="loginSignOn" options={['Email', 'CPF']} />
      </div>

      <SectionTitle icon={DollarSign} title="Informações de Remuneração" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SelectField label="Sindicato" name="sindicato" options={['SINDVIG', 'OUTROS']} />
        <InputField label="R$ Salário" name="salario" type="number" />
        <InputField label="R$ Complemento" name="complemento" type="number" />
        <InputField label="R$ Extra" name="extra" type="number" />
      </div>

      <SectionTitle icon={Phone} title="Dados de Contato" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InputField label="WhatsApp" name="whatsapp" />
        <InputField label="E-mail" name="email" type="email" />
      </div>

      <div className="mt-8 flex justify-end gap-2">
         <Button type="button" variant="ghost" onClick={() => navigate('/admin/colaboradores')} className="text-gray-400 hover:text-white">
            Cancelar
         </Button>
         <Button type="submit" className="bg-[#ff8c00] hover:bg-[#ff9d1f] text-white px-8">
            Salvar Registro
         </Button>
      </div>
    </motion.form>
    </FormContext.Provider>
  );
};

export default ColaboradorForm;
