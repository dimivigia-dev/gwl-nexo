import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import MainLayout from '@/components/layout/MainLayout';
import ColaboradorForm from '@/components/admin/ColaboradorForm';
import { loadPonto } from '@/services/pontoApi';
import { Loader2 } from 'lucide-react';

const ColaboradorManagement = () => {
  const { id } = useParams();
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (id) {
      loadPonto().then((data) => {
        const employee = (data.employees || []).find((item) => String(item.id) === String(id));
        if (employee) setInitialData({ id: employee.id, nome: employee.name, matricula: employee.registration, cpf: employee.cpf, cargo: employee.job_title, posto: employee.site_id || '', jornada: employee.schedule, dataAdmissao: employee.admission_date || '', inicioJornada: employee.journey_start_date || '', ctpsNumero: employee.ctps_number || '', ctpsSerie: employee.ctps_series || '', pisPasep: employee.pis_pasep || '', horarioEntrada: employee.expected_start || '06:00', horarioIntervaloInicio: employee.expected_break_start || '12:00', horarioIntervaloFim: employee.expected_break_end || '13:00', horarioSaida: employee.expected_end || '18:00', registraPonto: employee.registers_point ? 'SIM' : 'NAO', email: employee.email, whatsapp: employee.phone, registrosSemFoto: employee.require_photo ? 'NAO' : 'SIM', registrosSemGeo: employee.require_geo ? 'NAO' : 'SIM', status: employee.status });
      }).finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1a1a1a]">
        <Loader2 className="w-8 h-8 animate-spin text-[#ff8c00]" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{id ? 'Editar Colaborador' : 'Novo Colaborador'} - Dimivig</title>
      </Helmet>
      <MainLayout>
        <ColaboradorForm 
          initialData={initialData} 
          isEditMode={!!id} 
        />
      </MainLayout>
    </>
  );
};

export default ColaboradorManagement;
