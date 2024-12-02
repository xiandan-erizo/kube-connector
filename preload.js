const { contextBridge, ipcRenderer, shell } = require('electron')

// 辅助函数：创建事件监听包装器
const createEventHandler = (channel) => {
    return (callback) => {
        const wrappedCallback = (_, ...args) => callback(...args)
        ipcRenderer.on(channel, wrappedCallback)
        // 返回清理函数
        return () => ipcRenderer.removeListener(channel, wrappedCallback)
    }
}
// 辅助函数：创建异步调用包装器
const createInvokeHandler = (channel) => {
    return async (...args) => {
        try {
            return await ipcRenderer.invoke(channel, ...args)
        } catch (error) {
            console.error(`Error in ${channel}:`, error)
            throw error
        }
    }
}

// API 定义
const API = {
    // Kubeconfig 管理
    loadKubeconfigList: createInvokeHandler('get-kubeconfig-list'),
    loadKubeconfig: createInvokeHandler('load-kubeconfig'),
    selectKubeconfig: createInvokeHandler('select-kubeconfig'),
    getCurrentKubeconfig: createInvokeHandler('get-current-kubeconfig'),

    // Context 管理
    getContexts: createInvokeHandler('get-contexts'),
    switchContext: createInvokeHandler('switch-context'),
    getCurrentContext: createInvokeHandler('get-current-context'),

    // 资源管理
    getNamespaces: createInvokeHandler('get-namespaces'),
    getPods: createInvokeHandler('get-pods'),
    // Pod 相关 API
    getPodPorts: async (namespace, podName) => {
        if (!namespace || !podName) {
            console.error('Invalid parameters for getPodPorts:', { namespace, podName });
            return [];
        }
        return await ipcRenderer.invoke('get-pod-ports', { namespace, podName });
    },
    getPodLogs: createInvokeHandler('get-pod-logs'),
    getPodEvents: createInvokeHandler('get-pod-events'),

    // 端口转发管理
    startPortForward: createInvokeHandler('start-port-forward'),
    stopPortForward: createInvokeHandler('stop-port-forward'),
    stopAllPortForwards: createInvokeHandler('stop-all-port-forwards'),
    getActiveForwards: createInvokeHandler('get-active-forwards'),

    // 状态和错误事件监听
    onKubeconfigList: createEventHandler('kubeconfig-list'),
    onContextsUpdated: createEventHandler('contexts-updated'),
    onNamespacesUpdated: createEventHandler('namespaces-updated'),
    onPodsUpdated: createEventHandler('pods-updated'),
    onForwardsUpdated: createEventHandler('forwards-updated'),
    onConnectionStatus: createEventHandler('connection-status'),
    onK8sError: createEventHandler('k8s-error'),

    // 系统状态监听
    onSystemMemory: createEventHandler('system-memory'),
    onSystemCpu: createEventHandler('system-cpu'),

    // 日志和事件流
    onPodLogUpdate: createEventHandler('pod-log-update'),
    onPodEventUpdate: createEventHandler('pod-event-update'),

    // 配置管理
    saveConfig: createInvokeHandler('save-config'),
    loadConfig: createInvokeHandler('load-config'),

    // 应用状态
    getAppVersion: createInvokeHandler('get-app-version'),
    checkForUpdates: createInvokeHandler('check-for-updates'),

    // 工具函数
    openExternal: (url) => shell.openExternal(url),
    showItemInFolder: createInvokeHandler('show-item-in-folder'),
    showMessageBox: createInvokeHandler('show-message-box'),
    // openExternal: (url) => shell.openExternal(url),
}

// 注册所有 API 到 window 对象
contextBridge.exposeInMainWorld('electronAPI', API)

// // 开发环境工具
// if (process.env.NODE_ENV === 'development') {
//     // 为开发环境添加额外的调试功能
//     contextBridge.exposeInMainWorld('devTools', {
//         inspect: (...args) => console.log(...args),
//         reload: () => ipcRenderer.send('dev-reload'),
//         toggleDevTools: () => ipcRenderer.send('toggle-dev-tools')
//     })
// }

// 错误处理
window.addEventListener('error', (event) => {
    ipcRenderer.send('renderer-error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error ? event.error.stack : null
    })
})

window.addEventListener('unhandledrejection', (event) => {
    ipcRenderer.send('renderer-unhandled-rejection', {
        reason: event.reason ? event.reason.stack : event.reason
    })
})

// 清理函数
const cleanup = () => {
    // 在窗口关闭时执行清理
    API.stopAllPortForwards()
        .catch(error => console.error('Error stopping port forwards during cleanup:', error))
}

window.addEventListener('unload', cleanup)