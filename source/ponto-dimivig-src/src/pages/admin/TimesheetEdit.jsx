import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Camera, Clock, MapPin, Save } from 'lucide-react';
import { loadPonto, updatePonto } from '@/services/pontoApi';
import { useToast } from '@/components/ui/use-toast';

const TimesheetEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [record, setRecord] = useState(null);
  const [dateTime, setDateTime] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('valid');

  useEffect(() => {
    loadPonto().then((data) => {
      const found = (data.records || []).find((item) => String(item.id) === String(id));
      if (!found) return;
      setRecord(found);
      setDateTime(String(found.recorded_at).slice(0, 16));
      setNotes(found.notes || '');
      setStatus(found.status || 'valid');
    });
  }, [id]);

  const save = async () => {
    try {
      await updatePonto('record', id, { recordedAt: new Date(dateTime).toISOString(), notes, status });
      toast({ title: 'Alterações salvas', description: 'O registro foi atualizado e permaneceu rastreável.' });
      navigate('/admin/folha-ponto');
    } catch (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); }
  };

  return <><Helmet><title>Editar Ponto - Dimivig</title></Helmet><MainLayout><div className="max-w-4xl mx-auto space-y-6">
    <div className="flex items-center gap-4"><Button variant="ghost" size="icon" onClick={() => navigate('/admin/folha-ponto')} className="text-gray-400"><ArrowLeft className="w-6 h-6"/></Button><div><h1 className="text-2xl font-bold text-white">Editar Registro de Ponto</h1><p className="text-gray-400">{record ? `${record.employee_name} · ${record.site_name || 'Sem posto'}` : 'Carregando registro...'}</p></div></div>
    {record && <div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="md:col-span-2 space-y-4"><div className="bg-[#2a2a2a] rounded-lg p-6 border border-gray-800"><h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-[#ff8c00]"/> Data e horário</h3><input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-700 rounded p-3 text-white focus:border-[#ff8c00] outline-none"/><select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-4 w-full bg-[#1a1a1a] border border-gray-700 rounded p-3 text-white"><option value="valid">Válido</option><option value="invalid">Invalidado</option></select></div><div className="bg-[#2a2a2a] rounded-lg p-6 border border-gray-800"><h3 className="text-lg font-semibold text-white mb-4">Justificativa da edição</h3><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-700 rounded p-3 text-white focus:border-[#ff8c00] outline-none h-28" placeholder="Descreva o motivo da alteração..."/></div></div><div className="space-y-4"><div className="bg-[#2a2a2a] rounded-lg p-6 border border-gray-800"><h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2"><MapPin className="w-4 h-4"/> Localização</h3><p className="text-sm text-white">Latitude: {record.latitude || 'não registrada'}</p><p className="text-sm text-white">Longitude: {record.longitude || 'não registrada'}</p><p className="text-xs text-gray-500 mt-2">Precisão: {record.accuracy ? `±${record.accuracy} m` : 'não informada'}</p></div><div className="bg-[#2a2a2a] rounded-lg p-6 border border-gray-800"><h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2"><Camera className="w-4 h-4"/> Evidência</h3>{record.photo_key ? <img src={`/api/ponto?entity=photo&id=${record.id}`} alt="Foto do registro" className="w-full aspect-square object-cover rounded"/> : <p className="text-sm text-gray-500">Registro sem foto.</p>}</div></div></div>}
    <div className="flex justify-end"><Button onClick={save} disabled={!record || !dateTime} className="bg-[#ff8c00] hover:bg-[#ff9d1f] text-white"><Save className="w-4 h-4 mr-2"/> Salvar Alterações</Button></div>
  </div></MainLayout></>;
};

export default TimesheetEdit;
