import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('unlockAPI', {
  submit: (pwd: string) => ipcRenderer.send('unlock-attempt', pwd),
  onFailed: (cb: () => void) => {
    ipcRenderer.on('unlock-failed', cb)
  },
})
