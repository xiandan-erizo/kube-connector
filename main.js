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
        this.intervalHandles = new Set()

        // 绑定方法
        this.handleError = this.handleError.bind(this)
        this.handleStatusChange = this.handleStatusChange.bind(this)
        this.checkSystemResources = this.checkSystemResources.bind(this)
    }

    async initialize() {
        try {
            // 设置 IPC 处理器
            this.setupIpcHandlers()

            // 创建窗口
            await this.createWindow()

            // 注册错误和状态处理
            this.k8sClient.onError(this.handleError)
            this.k8sClient.onStatusChange(this.handleStatusChange)

            // 启动系统资源监控
            this.startResourceMonitoring()

            // 尝试恢复上次的连接
            await this.restoreLastSession()

            console.log('Application initialized successfully')
        } catch (error) {
            console.error('Failed to initialize application:', error)
            this.handleError({
                operation: 'initialization',
                message: error.message,
                details: error.stack
            })
        }
    }

    async createWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            },
            show: false // 在准备好之前不显示窗口
        })

        await this.mainWindow.loadFile('index.html')

        // 窗口准备好后再显示
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show()
        })

        if (process.env.NODE_ENV === 'development') {
            this.mainWindow.webContents.openDevTools()
        }

        this.mainWindow.on('closed', () => {
            this.mainWindow = null
        })
    }

    setupIpcHandlers() {
        // Kubeconfig 管理
        ipcMain.handle('get-kubeconfig-list', () => this.getKubeconfigList())
        ipcMain.handle('load-kubeconfig', (_, configPath) => this.loadKubeconfig(configPath))
        ipcMain.handle('get-current-kubeconfig', () => this.store.get('lastKubeconfig'))

        // Context 管理
        ipcMain.handle('get-contexts', () => this.k8sClient.getContexts())
        ipcMain.handle('switch-context', (_, contextName) => this.switchContext(contextName))
        ipcMain.handle('get-current-context', () => this.k8sClient.getCurrentContext())

        // 资源管理
        ipcMain.handle('get-namespaces', () => this.k8sClient.getNamespaces())
        ipcMain.handle('get-pods', (_, namespace) => this.k8sClient.getPods(namespace))
        ipcMain.handle('get-pod-ports', async (_, { namespace, podName }) => {
            try {
                if (!namespace || !podName) {
                    throw new Error(`Invalid parameters: namespace=${namespace}, podName=${podName}`);
                }
                return await this.k8sClient.getServicePortsForPod(namespace, podName);
            } catch (error) {
                this.handleError({
                    operation: 'getPodPorts',
                    message: error.message,
                    details: error.stack
                });
                return {
                    servicePorts: [],
                    containerPorts: [],
                    hasService: false
                };
            }
        });
        // 端口转发管理
        ipcMain.handle('start-port-forward', (_, config) => this.startPortForward(config))
        ipcMain.handle('stop-port-forward', (_, forwardId) => this.stopPortForward(forwardId))
        ipcMain.handle('stop-all-port-forwards', () => this.stopAllPortForwards())
        ipcMain.handle('get-active-forwards', () => this.getActiveForwards())

        // 应用配置
        ipcMain.handle('save-config', (_, config) => this.store.set('appConfig', config))
        ipcMain.handle('load-config', () => this.store.get('appConfig'))

        // 开发工具
        if (process.env.NODE_ENV === 'development') {
            ipcMain.on('dev-reload', () => this.mainWindow?.reload())
            ipcMain.on('toggle-dev-tools', () => this.mainWindow?.webContents.toggleDevTools())
        }
        // 添加 openExternal handler
        ipcMain.handle('open-external', async (_, url) => {
            try {
                await shell.openExternal(url);
                return true;
            } catch (error) {
                console.error('Failed to open external url:', error);
                return false;
            }
        });
    }

    async getKubeconfigList() {
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

            if (this.mainWindow) {
                this.mainWindow.webContents.send('kubeconfig-list', configs)
            }

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
    }

    async loadKubeconfig(configPath) {
        try {
            const success = await this.k8sClient.initialize(configPath)
            if (success) {
                this.store.set('lastKubeconfig', configPath)
                const contexts = this.k8sClient.getContexts()
                if (this.mainWindow) {
                    this.mainWindow.webContents.send('contexts-updated', contexts)
                }
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
    }

    async switchContext(contextName) {
        try {
            const success = await this.k8sClient.switchContext(contextName)
            if (success) {
                const namespaces = await this.k8sClient.getNamespaces()
                if (this.mainWindow) {
                    this.mainWindow.webContents.send('namespaces-updated', namespaces)
                }
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
    }
    // 在 main.js 的 AppManager 类中
    async startPortForward({ namespace, pod, localPort, remotePort }) {
        const forwardId = `${namespace}-${pod}-${localPort}-${remotePort}`;

        try {
            // 检查端口是否已被使用
            if (this.portForwards.has(forwardId)) {
                throw new Error('Port forward already exists');
            }

            const portForward = await this.k8sClient.startPortForward(
                namespace,
                pod,
                parseInt(localPort),
                parseInt(remotePort)
            );

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
            });

            this.updatePortForwards();
            return { success: true, id: forwardId };
        } catch (error) {
            console.error('Failed to start port forward:', error);
            this.handleError('startPortForward', error);
            return { success: false, error: error.message };
        }
    }

    async stopPortForward(forwardId) {
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
    }

    async stopAllPortForwards() {
        try {
            const promises = Array.from(this.portForwards.entries()).map(async ([id, forward]) => {
                try {
                    await this.stopPortForward(id)
                } catch (error) {
                    console.error(`Failed to stop port forward ${id}:`, error)
                }
            })

            await Promise.all(promises)
            this.portForwards.clear()
            this.updatePortForwards()
            return true
        } catch (error) {
            this.handleError('stopAllPortForwards', error)
            return false
        }
    }

    getActiveForwards() {
        return Array.from(this.portForwards.values()).map(({ config }) => config)
    }

    updatePortForwards() {
        if (!this.mainWindow) return;
        const forwardList = Array.from(this.portForwards.entries()).map(([id, { config }]) => ({
            id,
            ...config,
            context: this.k8sClient.getCurrentContext() || 'unknown'
        }));
        this.mainWindow.webContents.send('forwards-updated', forwardList);
    }

    startResourceMonitoring() {
        // 每30秒检查一次系统资源
        const handle = setInterval(this.checkSystemResources, 30000)
        this.intervalHandles.add(handle)
    }

    async checkSystemResources() {
        if (!this.mainWindow) return

        try {
            // 获取系统内存使用情况
            const memoryUsage = process.memoryUsage()
            this.mainWindow.webContents.send('system-memory', {
                heapUsed: memoryUsage.heapUsed,
                heapTotal: memoryUsage.heapTotal,
                rss: memoryUsage.rss
            })

            // 获取CPU使用情况
            const cpuUsage = process.cpuUsage()
            this.mainWindow.webContents.send('system-cpu', {
                user: cpuUsage.user,
                system: cpuUsage.system
            })
        } catch (error) {
            console.error('Error checking system resources:', error)
        }
    }

    async restoreLastSession() {
        const lastConfig = this.store.get('lastKubeconfig')
        if (lastConfig) {
            await this.loadKubeconfig(lastConfig)
        }
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
        // 停止所有定时器
        this.intervalHandles.forEach(handle => clearInterval(handle))
        this.intervalHandles.clear()

        // 停止所有端口转发
        this.stopAllPortForwards()
            .then(() => {
                this.k8sClient.cleanup()
                this.portForwards.clear()
            })
            .catch(error => {
                console.error('Error during cleanup:', error)
            })
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
    if (appManager.mainWindow) {
        appManager.handleError({
            operation: 'uncaughtException',
            message: error.message,
            details: error.stack
        })
    }
})

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error)
    if (appManager.mainWindow) {
        appManager.handleError({
            operation: 'unhandledRejection',
            message: error.message || String(error),
            details: error.stack || 'No stack trace available'
        })
    }
})

// 开发环境特定功能
if (process.env.NODE_ENV === 'development') {
    // 监听文件变化自动重载
    require('electron-reload')(__dirname, {
        electron: path.join(__dirname, 'node_modules', '.bin', 'electron')
    })
}
