const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const K8sClientHandler = require('./k8s-client')
const Store = require('electron-store')

class AppManager {
    constructor() {
        this.mainWindow = null
        this.k8sClient = new K8sClientHandler()
        this.store = new Store()
        this.portForwards = new Map()

        // 绑定方法
        this.handleError = this.handleError.bind(this)
        this.handleStatusChange = this.handleStatusChange.bind(this)
    }

    async initialize() {
        // 首先设置 IPC 处理器
        this.setupIpcHandlers()

        // 创建窗口
        this.createWindow()

        // 注册错误和状态处理
        this.k8sClient.onError(this.handleError)
        this.k8sClient.onStatusChange(this.handleStatusChange)

        // 尝试恢复上次的连接
        const lastConfig = this.store.get('lastKubeconfig')
        if (lastConfig) {
            await this.k8sClient.initialize(lastConfig)
        }
    }

    createWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            }
        })

        this.mainWindow.loadFile('index.html')

        if (process.env.NODE_ENV === 'development') {
            this.mainWindow.webContents.openDevTools()
        }
    }

    setupIpcHandlers() {
        // Kubeconfig 管理
        // 在 main.js 中，修改 setupIpcHandlers 方法中的 get-kubeconfig-list 处理部分

        ipcMain.handle('get-kubeconfig-list', async () => {
            try {
                const homeDir = process.env.HOME || process.env.USERPROFILE
                const kubeDir = path.join(homeDir, '.kube')
                console.log('Looking for kubeconfigs in:', kubeDir)

                if (!fs.existsSync(kubeDir)) {
                    console.log('Kube directory not found:', kubeDir)
                    return []
                }

                const files = fs.readdirSync(kubeDir)
                console.log('Found files in .kube directory:', files)

                const configs = files
                    .filter(file => !file.startsWith('.') && !file.startsWith('cache'))
                    .map(file => ({
                        name: file,
                        path: path.join(kubeDir, file),
                        isActive: file === path.basename(this.store.get('lastKubeconfig') || '')
                    }))

                // 主动发送事件给渲染进程
                this.mainWindow.webContents.send('kubeconfig-list', configs)

                return configs
            } catch (error) {
                console.error('Error reading kubeconfig directory:', error)
                this.handleError({
                    operation: 'getKubeconfigList',
                    message: error.message,
                    details: error.stack
                })
                return []
            }
        })

        ipcMain.handle('load-kubeconfig', async (event, configPath) => {
            try {
                const success = await this.k8sClient.initialize(configPath)
                if (success) {
                    this.store.set('lastKubeconfig', configPath)
                    const contexts = this.k8sClient.getContexts()
                    this.mainWindow.webContents.send('contexts-updated', contexts)
                    return { success: true, contexts }
                }
                return { success: false, error: 'Failed to initialize client' }
            } catch (error) {
                console.error('Error loading kubeconfig:', error)
                this.handleError({
                    operation: 'loadKubeconfig',
                    message: error.message,
                    details: error.stack
                })
                return { success: false, error: error.message }
            }
        })

        // Context 管理
        ipcMain.handle('get-contexts', () => {
            return this.k8sClient.getContexts()
        })

        ipcMain.handle('switch-context', async (event, contextName) => {
            try {
                const success = await this.k8sClient.switchContext(contextName)
                if (success) {
                    const namespaces = await this.k8sClient.getNamespaces()
                    this.mainWindow.webContents.send('namespaces-updated', namespaces)
                    return { success: true, namespaces }
                }
                return { success: false, error: 'Failed to switch context' }
            } catch (error) {
                this.handleError({
                    operation: 'switchContext',
                    message: error.message,
                    details: error.stack
                })
                return { success: false, error: error.message }
            }
        })

        // 资源管理
        ipcMain.handle('get-namespaces', async () => {
            try {
                return await this.k8sClient.getNamespaces()
            } catch (error) {
                this.handleError('getNamespaces', error)
                return []
            }
        })

        ipcMain.handle('get-pods', async (event, namespace) => {
            try {
                return await this.k8sClient.getPods(namespace)
            } catch (error) {
                this.handleError('getPods', error)
                return []
            }
        })

        ipcMain.handle('get-pod-ports', async (event, { namespace, podName }) => {
            try {
                return await this.k8sClient.getPodContainerPorts(namespace, podName)
            } catch (error) {
                this.handleError('getPodPorts', error)
                return []
            }
        })

        // 端口转发管理
        ipcMain.handle('start-port-forward', async (event, { namespace, pod, localPort, remotePort }) => {
            const forwardId = `${namespace}-${pod}-${localPort}-${remotePort}`

            try {
                const portForward = await this.k8sClient.startPortForward(
                    namespace,
                    pod,
                    parseInt(localPort),
                    parseInt(remotePort)
                )

                this.portForwards.set(forwardId, {
                    portForward,
                    config: {
                        id: forwardId,
                        namespace,
                        pod,
                        localPort,
                        remotePort,
                        active: true
                    }
                })

                this.updatePortForwards()
                return { success: true, id: forwardId }
            } catch (error) {
                this.handleError('startPortForward', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('stop-port-forward', async (event, forwardId) => {
            try {
                const forward = this.portForwards.get(forwardId)
                if (forward) {
                    forward.portForward.close()
                    forward.config.active = false
                    this.portForwards.delete(forwardId)
                    this.updatePortForwards()
                    return true
                }
                return false
            } catch (error) {
                this.handleError('stopPortForward', error)
                return false
            }
        })

        // 状态查询
        ipcMain.handle('get-connection-status', () => {
            return this.k8sClient.connectionStatus
        })
    }

    updatePortForwards() {
        if (!this.mainWindow) return

        const forwardList = Array.from(this.portForwards.entries()).map(([id, { config }]) => ({
            id,
            ...config,
            context: this.k8sClient.client?.kubeConfig.getCurrentContext() || 'unknown'
        }))

        this.mainWindow.webContents.send('forwards-updated', forwardList)
    }

    handleError(errorInfo) {
        console.error('K8s client error:', errorInfo)
        if (this.mainWindow) {
            this.mainWindow.webContents.send('k8s-error', errorInfo)
        }
    }

    handleStatusChange(status) {
        console.log('Connection status changed:', status)
        if (this.mainWindow) {
            this.mainWindow.webContents.send('connection-status', status)
        }
    }

    cleanup() {
        this.portForwards.forEach(({ portForward }) => {
            try {
                portForward.close()
            } catch (error) {
                console.error('Error closing port forward:', error)
            }
        })
        this.portForwards.clear()
        this.k8sClient.cleanup()
    }
}

// 应用初始化
const appManager = new AppManager()

app.whenReady().then(async () => {
    console.log('App is ready, initializing...')
    await appManager.initialize()
    console.log('Initialization complete')

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            appManager.createWindow()
        }
    })
}).catch(error => {
    console.error('Error during app initialization:', error)
})

app.on('window-all-closed', () => {
    console.log('All windows closed')
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('will-quit', () => {
    appManager.cleanup()
})

// 全局错误处理
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error)
})