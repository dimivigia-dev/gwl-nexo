import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const BackButton = () => {
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      onClick={() => navigate(-1)}
      className="mb-4 pl-0 text-gray-400 hover:text-[#ff8c00] hover:bg-transparent transition-colors group"
    >
      <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
      Voltar
    </Button>
  );
};

export default BackButton;