import React, { useState, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { motion } from 'framer-motion';
import { useOfflineSync } from '@/hooks/useOfflineSync';

const MainLayout = ({ children }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const {
    isOnline,
    pendingSync,
    isSyncing,
    syncPendingData,
  } = useOfflineSync();

  // Handle window resize to determine mobile state
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth < 1024) {
        setSidebarOpen(false); // Default to collapsed/hidden on mobile logic
      } else {
        setSidebarOpen(true); // Default to expanded on desktop
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleSidebar = () => {
    if (isMobile) {
      setMobileOpen(!isMobileOpen);
    } else {
      setSidebarOpen(!isSidebarOpen);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col">
      <Header
        onMenuToggle={toggleSidebar}
        syncStatus={{
          isOnline,
          pendingSync,
          isSyncing,
          onSync: () => syncPendingData(true),
        }}
      />
      
      <div className="flex flex-1 relative">
        <Sidebar 
          isOpen={isSidebarOpen} 
          isMobileOpen={isMobileOpen}
          setIsMobileOpen={setMobileOpen}
          isMobile={isMobile}
        />
        
        <motion.main 
          layout
          className="flex-1 bg-[#1a1a1a] p-4 lg:p-6 w-full overflow-x-hidden"
          animate={{ 
            marginLeft: isMobile ? 0 : (isSidebarOpen ? 0 : 0) 
            // We are using flex layout, so margin isn't needed if sidebar is relative in flex container.
            // Sidebar component will handle its own width animation, pushing main content.
          }}
          transition={{ duration: 0.3, type: "spring", stiffness: 100 }}
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
};

export default MainLayout;
