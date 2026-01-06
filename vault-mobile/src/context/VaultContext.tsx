/**
 * Vault Context
 * Provides vault state across the app
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { vaultService, VaultEntry } from '../services/vaultService';

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
    } else {
      setEntries([]);
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
