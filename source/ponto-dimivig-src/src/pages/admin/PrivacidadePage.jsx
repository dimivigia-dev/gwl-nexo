import React from 'react';
import { Helmet } from 'react-helmet';
import MainLayout from '@/components/layout/MainLayout';
import BackButton from '@/components/common/BackButton';
import { Database, KeyRound, ShieldCheck, UserCheck } from 'lucide-react';

const practices = [
  {
    icon: ShieldCheck,
    title: 'Base legal e finalidade',
    description: 'Tratamento de dados vinculado a controle de jornada, segurança e conformidade.',
  },
  {
    icon: Database,
    title: 'Retenção e descarte',
    description: 'Períodos de retenção devem seguir exigências contratuais e trabalhistas.',
  },
  {
    icon: KeyRound,
    title: 'Controle de acesso',
    description: 'Permissões por perfil e rastreio de login/logout em áreas sensíveis.',
  },
  {
    icon: UserCheck,
    title: 'Direitos do titular',
    description: 'Canal para consulta, correção e revisão de dados pessoais.',
  },
];

const PrivacidadePage = () => {
  return (
    <>
      <Helmet>
        <title>Política de Privacidade - Dimivig</title>
      </Helmet>

      <MainLayout>
        <div className="space-y-6">
          <div>
            <BackButton />
            <h1 className="text-2xl font-bold text-white mt-2">Política de Privacidade</h1>
            <p className="text-sm text-gray-400 mt-1">
              Resumo operacional das diretrizes de proteção de dados da plataforma.
            </p>
          </div>

          <section className="rounded-xl border border-gray-800 bg-[#2a2a2a] p-5">
            <h2 className="text-lg font-semibold text-white">Princípios aplicados</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {practices.map((item) => (
                <article key={item.title} className="rounded-lg border border-gray-700 bg-[#1a1a1a] p-4">
                  <div className="w-9 h-9 rounded-md bg-[#ff8c00]/10 border border-[#ff8c00]/20 flex items-center justify-center">
                    <item.icon className="w-4 h-4 text-[#ff8c00]" />
                  </div>
                  <h3 className="text-white font-medium mt-3">{item.title}</h3>
                  <p className="text-sm text-gray-400 mt-1">{item.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-800 bg-[#2a2a2a] p-5">
            <h2 className="text-lg font-semibold text-white">Contato para privacidade</h2>
            <p className="text-sm text-gray-300 mt-2">
              DPO / Encarregado: <span className="text-[#ff8c00]">privacidade@dimivig.com.br</span>
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Documento interno sujeito a revisão jurídica e atualização periódica.
            </p>
          </section>
        </div>
      </MainLayout>
    </>
  );
};

export default PrivacidadePage;
