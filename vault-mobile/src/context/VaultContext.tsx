/**
 * Vault Context
 * Provides vault state across the app
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { vaultService, VaultEntry } from '../services/vaultService';
import { syncService } from '../services/syncService';

interface SyncEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string | null;
  notes: string | null;
  totpSecret: string | null;
  folderId: string | null;
  isFavorite: boolean;
  createdAt: number;
  modifiedAt: number;
}

interface VaultContextType {
  isUnlocked: boolean;
  isLoading: boolean;
  vaultExists: boolean;
  entries: VaultEntry[];
  unlock: (password: string) => Promise<boolean>;
  create: (password: string) => Promise<void>;
  lock: () => void;
  refreshEntries: () => Promise<void>;
  addEntry: (entry: Omit<VaultEntry, 'id' | 'createdAt' | 'modifiedAt' | 'syncVersion'>) => Promise<string>;
  updateEntry: (id: string, updates: Partial<VaultEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<boolean>;
  importEntries: (entries: SyncEntry[]) => Promise<void>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [vaultExists, setVaultExists] = useState(false);
  const [entries, setEntries] = useState<VaultEntry[]>([]);

  useEffect(() => {
    checkVaultStatus();
  }, []);

  const checkVaultStatus = async () => {
    try {
      const exists = await vaultService.vaultExists();
      setVaultExists(exists);
      setIsUnlocked(vaultService.getIsUnlocked());
    } catch (error) {
      console.error('Failed to check vault status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshEntries = useCallback(async () => {
    if (!isUnlocked) return;
    try {
      const allEntries = await vaultService.getAllEntries();
      setEntries(allEntries);
    } catch (error) {
      console.error('Failed to refresh entries:', error);
    }
  }, [isUnlocked]);

  useEffect(() => {
    if (isUnlocked) {
      refreshEntries();
      
      // Register sync request handler globally when vault is unlocked
      const handleSyncRequest = async () => {
        console.log('Processing sync request from desktop...');
        try {
          const allEntries = await vaultService.getAllEntries();
          console.log(`Fetched ${allEntries.length} entries from vault`);
          
          const syncEntries = allEntries.map(e => ({
            id: e.id,
            title: e.title,
            username: e.username,
            password: e.password,
            url: e.url,
            notes: e.notes,
            totpSecret: e.totpSecret,
            folderId: e.folderId,
            isFavorite: e.isFavorite,
            createdAt: e.createdAt,
            modifiedAt: e.modifiedAt,
          }));
          
          syncService.sendSyncResponse(syncEntries);
          console.log(`Sent ${syncEntries.length} entries to desktop`);
        } catch (error) {
          console.error('Failed to fetch entries for sync:', error);
          syncService.sendSyncResponse([]);
        }
      };
      
      syncService.setSyncRequestHandler(handleSyncRequest);
      
      return () => {
        // Clear handler when vault is locked
        syncService.setSyncRequestHandler(() => Promise.resolve());
      };
    } else {
      setEntries([]);
      // Clear handler when vault is locked
      syncService.setSyncRequestHandler(() => Promise.resolve());
    }
  }, [isUnlocked, refreshEntries]);

  const unlock = async (password: string): Promise<boolean> => {
    const success = await vaultService.openVault(password);
    if (success) {
      setIsUnlocked(true);
    }
    return success;
  };

  const create = async (password: string): Promise<void> => {
    await vaultService.createVault(password);
    setVaultExists(true);
    setIsUnlocked(true);
  };

  const lock = () => {
    vaultService.lockVault();
    setIsUnlocked(false);
    setEntries([]);
  };

  const addEntry = async (
    entry: Omit<VaultEntry, 'id' | 'createdAt' | 'modifiedAt' | 'syncVersion'>
  ): Promise<string> => {
    const id = await vaultService.addEntry(entry);
    await refreshEntries();
    return id;
  };

  const updateEntry = async (
    id: string,
    updates: Partial<VaultEntry>
  ): Promise<void> => {
    await vaultService.updateEntry(id, updates);
    await refreshEntries();
  };

  const deleteEntry = async (id: string): Promise<void> => {
    await vaultService.deleteEntry(id);
    await refreshEntries();
  };

  const toggleFavorite = async (id: string): Promise<boolean> => {
    const newValue = await vaultService.toggleFavorite(id);
    await refreshEntries();
    return newValue;
  };

  const importEntries = async (entries: SyncEntry[]): Promise<void> => {
    await vaultService.importEntries(entries);
    await refreshEntries();
  };

  return (
    <VaultContext.Provider
      value={{
        isUnlocked,
        isLoading,
        vaultExists,
        entries,
        unlock,
        create,
        lock,
        refreshEntries,
        addEntry,
        updateEntry,
        deleteEntry,
        toggleFavorite,
        importEntries,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (context === undefined) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
}
