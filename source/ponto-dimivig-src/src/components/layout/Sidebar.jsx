import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  LayoutDashboard, 
  MapPin, 
  Users, 
  Layers, 
  Clock, 
  Briefcase, 
  Shield, 
  LogOut, 
  FileText, 
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const Sidebar = ({ isOpen, isMobileOpen, setIsMobileOpen, isMobile }) => {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    if (window.confirm('Tem certeza que deseja sair do sistema?')) {
      await logout();
      navigate('/');
    }
  };

  const adminItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin', exact: true },
    { icon: MapPin, label: 'Postos de Serviço', path: '/admin/postos-de-servico' },
    { icon: Users, label: 'Colaboradores', path: '/admin/colaboradores' },
    { icon: Layers, label: 'Gestão Operacional', path: '/admin/lancamento-operacional' },
    { icon: Clock, label: 'Ponto Eletrônico', path: '/admin/folha-ponto' },
    { icon: FileText, label: 'Entrega de Arquivos', path: '/admin/entrega-arquivos' },
    { icon: Briefcase, label: 'Cadastros', path: '/admin/cadastros-gerais' },
    { icon: Shield, label: 'Política de Privacidade', path: '/admin/privacidade' },
  ];
  const menuItems = userProfile?.perfil === 'Administrador' ? adminItems : userProfile?.perfil === 'Fiscal'
    ? [{ icon: LayoutDashboard, label: 'Dashboard', path: '/fiscal', exact: true }, { icon: Clock, label: 'Ponto Eletrônico', path: '/admin/folha-ponto' }, { icon: Layers, label: 'Gestão Operacional', path: '/admin/lancamento-operacional' }, { icon: FileText, label: 'Entrega de Arquivos', path: '/admin/entrega-arquivos' }]
    : userProfile?.perfil === 'Cliente'
      ? [{ icon: LayoutDashboard, label: 'Portal do Cliente', path: '/cliente', exact: true }]
      : [{ icon: LayoutDashboard, label: 'Meu Ponto', path: '/colaborador', exact: true }];

  const sidebarVariants = {
    expanded: { width: 280 },
    collapsed: { width: 80 },
  };

  const NavItem = ({ item, isCollapsed }) => {
    const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path));
    
    return (
      <NavLink
        to={item.path}
        onClick={() => isMobile && setIsMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative overflow-hidden mb-1 mx-2",
          isActive 
            ? "bg-[#ff8c00] text-white shadow-lg shadow-orange-900/20" 
            : "text-gray-400 hover:bg-[#2a2a2a] hover:text-white"
        )}
      >
        <item.icon className={cn(
          "w-5 h-5 flex-shrink-0 transition-colors",
          isActive ? "text-white" : "group-hover:text-[#ff8c00]"
        )} />
        
        {!isCollapsed && (
          <motion.span 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="font-medium whitespace-nowrap"
          >
            {item.label}
          </motion.span>
        )}

        {isCollapsed && isActive && (
          <div className="absolute right-2 w-2 h-2 rounded-full bg-white" />
        )}
      </NavLink>
    );
  };

  // Mobile Drawer
  if (isMobile) {
    return (
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-72 bg-[#1a1a1a] border-r border-gray-800 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-gray-800 flex items-center justify-between">
                <span className="font-bold text-white text-lg">Menu Navegação</span>
                <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(false)} className="text-gray-400 hover:text-white">
                  <ChevronLeft className="w-6 h-6" />
                </Button>
              </div>
              
              <nav className="flex-1 overflow-y-auto py-6">
                {menuItems.map((item) => (
                  <NavItem key={item.path} item={item} isCollapsed={false} />
                ))}
              </nav>

              <div className="p-4 border-t border-gray-800">
                <a href="/" className="mb-2 w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-orange-500/10 hover:text-[#ff8c00] transition-colors">
                  <span aria-hidden="true">&#8592;</span>
                  <span className="font-medium">GWL NEXO</span>
                </a>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Sair</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
  }

  // Desktop Sidebar
  return (
    <motion.aside
      initial={isOpen ? "expanded" : "collapsed"}
      animate={isOpen ? "expanded" : "collapsed"}
      variants={sidebarVariants}
      transition={{ duration: 0.3, type: "spring", stiffness: 100, damping: 20 }}
      className="hidden lg:flex flex-col bg-[#1a1a1a] border-r border-gray-800 h-[calc(100vh-65px)] sticky top-[65px]"
    >
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-6">
        {menuItems.map((item) => (
          <NavItem key={item.path} item={item} isCollapsed={!isOpen} />
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <a
          href="/"
          className={cn(
            "mb-2 flex items-center gap-3 px-3 py-3 rounded-lg text-gray-400 hover:bg-orange-500/10 hover:text-[#ff8c00] transition-colors w-full",
            !isOpen && "justify-center"
          )}
          title="Voltar ao GWL NEXO"
        >
          <span aria-hidden="true">&#8592;</span>
          {isOpen && <span className="font-medium whitespace-nowrap">GWL NEXO</span>}
        </a>
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 px-3 py-3 rounded-lg text-gray-400 hover:bg-red-500/10 hover:text-red-500 transition-colors w-full",
            !isOpen && "justify-center"
          )}
          title="Sair"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {isOpen && <span className="font-medium whitespace-nowrap">Sair</span>}
        </button>
      </div>
      
      {/* Footer Info - Only visible when expanded */}
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="p-4 bg-[#151515] text-center border-t border-gray-800"
        >
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Ponto Dimivig</p>
          <p className="text-[10px] text-gray-600">v1.2.0</p>
        </motion.div>
      )}
    </motion.aside>
  );
};

export default Sidebar;
