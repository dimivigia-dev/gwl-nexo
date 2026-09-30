import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Menu, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { motion } from 'framer-motion';
import Logo from '@/components/Logo';

const Header = ({ onMenuToggle, syncStatus }) => {
  const { userProfile, logout } = useAuth();
  const {
    isOnline = true,
    pendingSync = 0,
    isSyncing = false,
    onSync = () => {},
  } = syncStatus || {};

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-[#2a2a2a] border-b border-gray-800 sticky top-0 z-50 shadow-md h-[65px]"
    >
      <div className="flex items-center justify-between px-4 h-full">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuToggle}
            className="text-white hover:bg-[#333] hover:text-[#ff8c00] transition-colors"
          >
            <Menu className="w-6 h-6" />
          </Button>
          
          <div className="flex items-center gap-3 pl-2 border-l border-gray-700">
            <Logo className="h-8 md:h-9 w-auto" />
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden lg:flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-red-500/10 text-red-300 border-red-500/30'
            }`}>
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
              <span className="opacity-80">| {pendingSync} pendente(s)</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onSync}
              disabled={!isOnline || isSyncing || pendingSync === 0}
              className="border-gray-700 bg-[#1a1a1a] text-gray-200 hover:bg-[#252525] disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              Sincronizar
            </Button>
          </div>

          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-bold text-white leading-none">
              {userProfile?.nome}
            </span>
            <span className="text-[10px] text-[#ff8c00] uppercase tracking-wide font-medium mt-1">
              {userProfile?.perfil}
            </span>
          </div>

          <div className="h-8 w-[1px] bg-gray-700 hidden md:block"></div>

          <Button
            onClick={logout}
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
            title="Sair"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </motion.header>
  );
};

export default Header;
