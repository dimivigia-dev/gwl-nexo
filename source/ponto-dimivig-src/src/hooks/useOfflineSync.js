import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  getPendingRegistrosCount,
  getPendingRegistrosPonto,
  markPendingRegistrosAsSynced,
} from '@/utils/pontoStorage';
import { createPonto } from '@/services/pontoApi';

export const useOfflineSync = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const { toast } = useToast();

  const checkPendingItems = () => {
    setPendingSync(getPendingRegistrosCount());
  };

  const syncPendingData = async (showToastWhenEmpty = true) => {
    if (isSyncing) return;

    if (!navigator.onLine) {
      toast({
        title: 'Sem conexão',
        description: 'Conecte-se à internet para sincronizar os registros.',
        variant: 'destructive',
      });
      return;
    }

    const pendingRegistros = getPendingRegistrosPonto();
    if (!pendingRegistros.length) {
      if (showToastWhenEmpty) {
        toast({
          title: 'Sem pendências',
          description: 'Não há registros para sincronizar.',
        });
      }
      return;
    }

    try {
      setIsSyncing(true);

      const synced = [];
      for (const item of pendingRegistros) {
        await createPonto('record', item.payload);
        synced.push(item.id);
      }
      const remaining = markPendingRegistrosAsSynced(synced);
      setPendingSync(remaining.length);
      setLastSyncAt(new Date().toISOString());
      window.dispatchEvent(new Event('dimivig:ponto-updated'));

      toast({
        title: 'Sincronização completa',
        description: `${synced.length} registro(s) sincronizado(s).`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      toast({
        title: 'Conexão restaurada',
        description: 'Sincronizando dados pendentes...',
      });
      await syncPendingData(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: 'Modo offline',
        description: 'Seus dados serão sincronizados quando voltar online.',
        variant: 'destructive',
      });
    };

    const handleRegistrosUpdated = () => {
      checkPendingItems();
    };

    checkPendingItems();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('dimivig:ponto-updated', handleRegistrosUpdated);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('dimivig:ponto-updated', handleRegistrosUpdated);
    };
  }, []);

  return {
    isOnline,
    pendingSync,
    isSyncing,
    lastSyncAt,
    syncPendingData,
  };
};
