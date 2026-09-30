import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Clock, AlertCircle, Users } from 'lucide-react';
import { loadPonto } from '@/services/pontoApi';

const FiscalDashboard = () => {
  const { userProfile } = useAuth();
  const [data, setData] = useState({ employees: [], records: [], justifications: [] });
  useEffect(() => { loadPonto().then(setData).catch(() => {}); }, []);
  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = useMemo(() => data.records.filter((r) => String(r.recorded_at).slice(0, 10) === today), [data.records, today]);

  return (
    <>
      <Helmet>
        <title>Dashboard - Fiscal</title>
        <meta name="description" content="Dashboard do fiscal - Sistema Dimivig" />
      </Helmet>
      <MainLayout>
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-3xl font-bold text-white mb-2">
              Dashboard Fiscal
            </h1>
            <p className="text-gray-400">Bem-vindo, {userProfile?.nome}</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-[#2a2a2a] rounded-xl p-6 border border-gray-800 hover:shadow-2xl transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#ff8c00]/10 rounded-lg">
                  <Users className="w-6 h-6 text-[#ff8c00]" />
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Colaboradores</p>
                  <p className="text-2xl font-bold text-white">{data.employees.filter((e) => e.status === 'active').length}</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-[#2a2a2a] rounded-xl p-6 border border-gray-800 hover:shadow-2xl transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <Clock className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Registros Hoje</p>
                  <p className="text-2xl font-bold text-white">{todayRecords.length}</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-[#2a2a2a] rounded-xl p-6 border border-gray-800 hover:shadow-2xl transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500/10 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Ocorrências</p>
                  <p className="text-2xl font-bold text-white">{data.justifications.filter((j) => j.status === 'pending').length}</p>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="bg-[#2a2a2a] rounded-xl border border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-800"><h2 className="font-semibold text-white">Últimos registros do dia</h2></div>
            <div className="divide-y divide-gray-800">{todayRecords.slice(0, 20).map((r) => <div key={r.id} className="p-4 flex justify-between gap-4 text-sm"><span className="text-white">{r.employee_name}</span><span className="text-gray-400">{r.site_name || 'Sem posto'}</span><span className="text-[#ff8c00]">{new Date(r.recorded_at).toLocaleTimeString('pt-BR')}</span></div>)}{!todayRecords.length && <p className="p-8 text-center text-gray-500">Nenhum registro hoje.</p>}</div>
          </div>
        </div>
      </MainLayout>
    </>
  );
};

export default FiscalDashboard;
