import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  selectBackupPath: () => ipcRenderer.invoke('select-backup-path'),
  resetFingerprint: (pwd: string) => ipcRenderer.invoke('reset-fingerprint', pwd),
})
