const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    // Kubeconfig 管理
    loadKubeconfigList: () => ipcRenderer.invoke('get-kubeconfig-list'),
    loadKubeconfig: (path) => ipcRenderer.invoke('load-kubeconfig', path),

    // Context 管理
    getContexts: () => ipcRenderer.invoke('get-contexts'),
    switchContext: (context) => ipcRenderer.invoke('switch-context', context),

    // 资源管理
    getNamespaces: () => ipcRenderer.invoke('get-namespaces'),
    getPods: (namespace) => ipcRenderer.invoke('get-pods', namespace),
    getPodPorts: (namespace, podName) => ipcRenderer.invoke('get-pod-ports', { namespace, podName }),

    // 端口转发管理
    startPortForward: (config) => ipcRenderer.invoke('start-port-forward', config),
    stopPortForward: (id) => ipcRenderer.invoke('stop-port-forward', id),

    // 状态查询
    getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),

    // 事件监听
    onKubeconfigList: (callback) => {
        ipcRenderer.on('kubeconfig-list', (event, ...args) => callback(...args))
        return () => ipcRenderer.removeListener('kubeconfig-list', callback)
    },
    onContextsUpdated: (callback) => {
        ipcRenderer.on('contexts-updated', (event, ...args) => callback(...args))
        return () => ipcRenderer.removeListener('contexts-updated', callback)
    },
    onNamespacesUpdated: (callback) => {
        ipcRenderer.on('namespaces-updated', (event, ...args) => callback(...args))
        return () => ipcRenderer.removeListener('namespaces-updated', callback)
    },
    onForwardsUpdated: (callback) => {
        ipcRenderer.on('forwards-updated', (event, ...args) => callback(...args))
        return () => ipcRenderer.removeListener('forwards-updated', callback)
    },
    onConnectionStatus: (callback) => {
        ipcRenderer.on('connection-status', (event, ...args) => callback(...args))
        return () => ipcRenderer.removeListener('connection-status', callback)
    },
    onK8sError: (callback) => {
        ipcRenderer.on('k8s-error', (event, ...args) => callback(...args))
        return () => ipcRenderer.removeListener('k8s-error', callback)
    },

    // 移除事件监听器
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel)
    }
})