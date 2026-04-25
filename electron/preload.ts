import { contextBridge, ipcRenderer } from 'electron'

type UpdateStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string; notes?: string; assetUrl?: string; assetSize?: number }
  | { phase: 'not-available'; version: string }
  | { phase: 'downloading'; percent: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { phase: 'downloaded'; version: string; filePath?: string }
  | { phase: 'error'; message: string }

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  selectBackupPath: () => ipcRenderer.invoke('select-backup-path'),
  resetFingerprint: (pwd: string) => ipcRenderer.invoke('reset-fingerprint', pwd),
  update: {
    isSupported: (): Promise<boolean> => ipcRenderer.invoke('update:supported'),
    getStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:get-status'),
    check: (): Promise<void> => ipcRenderer.invoke('update:check'),
    download: (): Promise<void> => ipcRenderer.invoke('update:download'),
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    onStatus: (cb: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_e: unknown, status: UpdateStatus) => cb(status)
      ipcRenderer.on('update:status', listener)
      return () => ipcRenderer.removeListener('update:status', listener)
    },
  },
})
