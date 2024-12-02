const k8s = require('@kubernetes/client-node')

class K8sClientHandler {
    constructor() {
        this.client = null
        this.connectionStatus = 'disconnected'
        this.errorHandlers = new Set()
        this.statusHandlers = new Set()
    }

    // 事件处理
    onError(handler) {
        this.errorHandlers.add(handler)
        return () => this.errorHandlers.delete(handler)
    }

    onStatusChange(handler) {
        this.statusHandlers.add(handler)
        return () => this.statusHandlers.delete(handler)
    }

    emitError(error, operation) {
        const errorInfo = {
            operation,
            message: error.message,
            timestamp: new Date().toISOString()
        }
        this.errorHandlers.forEach(handler => handler(errorInfo))
    }

    emitStatusChange(status) {
        this.connectionStatus = status
        this.statusHandlers.forEach(handler => handler(status))
    }

    // 初始化和验证
    async validateConnection(kc, contextName) {
        try {
            kc.setCurrentContext(contextName)
            const client = kc.makeApiClient(k8s.CoreV1Api)
            await client.getAPIResources()
            return true
        } catch (error) {
            console.error(`Failed to validate context ${contextName}:`, error.message)
            return false
        }
    }

    async initialize(configPath) {
        try {
            console.log('Initializing with config:', configPath)
            const kc = new k8s.KubeConfig()
            kc.loadFromFile(configPath)

            // 获取并验证所有上下文
            const contexts = kc.getContexts()
            const currentContext = kc.getCurrentContext()

            console.log('Found contexts:', contexts.map(c => c.name))
            console.log('Current context:', currentContext)

            // 首先尝试当前上下文
            if (await this.validateConnection(kc, currentContext)) {
                this.client = {
                    core: kc.makeApiClient(k8s.CoreV1Api),
                    portForward: new k8s.PortForward(kc),
                    kubeConfig: kc
                }
                this.emitStatusChange('connected')
                console.log('Successfully connected to current context:', currentContext)
                return true
            }

            // 如果当前上下文失败，尝试其他上下文
            for (const ctx of contexts) {
                if (ctx.name !== currentContext && await this.validateConnection(kc, ctx.name)) {
                    this.client = {
                        core: kc.makeApiClient(k8s.CoreV1Api),
                        portForward: new k8s.PortForward(kc),
                        kubeConfig: kc
                    }
                    this.emitStatusChange('connected')
                    console.log('Successfully connected to alternative context:', ctx.name)
                    return true
                }
            }

            throw new Error('No valid context found in the kubeconfig')
        } catch (error) {
            console.error('Initialization failed:', error)
            this.emitError(error, 'initialization')
            this.emitStatusChange('disconnected')
            return false
        }
    }

    // Context 管理
    async switchContext(contextName) {
        try {
            console.log('Switching to context:', contextName)
            if (!this.client?.kubeConfig) {
                throw new Error('Kubernetes client not initialized')
            }

            if (await this.validateConnection(this.client.kubeConfig, contextName)) {
                this.client.kubeConfig.setCurrentContext(contextName)
                this.client.core = this.client.kubeConfig.makeApiClient(k8s.CoreV1Api)
                this.client.portForward = new k8s.PortForward(this.client.kubeConfig)
                this.emitStatusChange('connected')
                return true
            }
            throw new Error(`Unable to connect to context: ${contextName}`)
        } catch (error) {
            console.error('Context switch failed:', error)
            this.emitError(error, 'switchContext')
            return false
        }
    }

    getContexts() {
        if (!this.client?.kubeConfig) return []

        try {
            const contexts = this.client.kubeConfig.getContexts()
            const currentContext = this.client.kubeConfig.getCurrentContext()

            return contexts.map(ctx => ({
                name: ctx.name,
                cluster: ctx.context.cluster,
                namespace: ctx.context.namespace || 'default',
                user: ctx.context.user,
                isCurrent: ctx.name === currentContext
            }))
        } catch (error) {
            console.error('Failed to get contexts:', error)
            return []
        }
    }

    // 资源操作
    async getNamespaces() {
        try {
            if (!this.client?.core) {
                throw new Error('Kubernetes client not initialized')
            }

            const response = await this.client.core.listNamespace()
            return response.body.items.map(ns => ({
                name: ns.metadata.name,
                status: ns.status.phase,
                creationTimestamp: ns.metadata.creationTimestamp
            }))
        } catch (error) {
            console.error('Failed to get namespaces:', error)
            this.emitError(error, 'getNamespaces')
            return []
        }
    }

    async getPods(namespace) {
        try {
            if (!this.client?.core) {
                throw new Error('Kubernetes client not initialized')
            }

            const response = await this.client.core.listNamespacedPod(namespace)
            return response.body.items.map(pod => ({
                name: pod.metadata.name,
                namespace: pod.metadata.namespace,
                status: pod.status.phase,
                ready: pod.status.conditions?.some(c => c.type === 'Ready' && c.status === 'True'),
                containers: pod.spec.containers.map(c => ({
                    name: c.name,
                    image: c.image,
                    ports: c.ports || []
                })),
                creationTimestamp: pod.metadata.creationTimestamp
            }))
        } catch (error) {
            console.error('Failed to get pods:', error)
            this.emitError(error, 'getPods')
            return []
        }
    }

    async getPodContainerPorts(namespace, podName) {
        try {
            if (!this.client?.core) {
                throw new Error('Kubernetes client not initialized')
            }

            const response = await this.client.core.readNamespacedPod(podName, namespace)
            const containers = response.body.spec.containers

            return containers.flatMap(container => {
                return (container.ports || []).map(port => ({
                    containerName: container.name,
                    containerPort: port.containerPort,
                    protocol: port.protocol || 'TCP',
                    name: port.name || `${port.containerPort}/${port.protocol || 'TCP'}`
                }))
            })
        } catch (error) {
            console.error('Failed to get pod ports:', error)
            this.emitError(error, 'getPodContainerPorts')
            return []
        }
    }

    async startPortForward(namespace, pod, localPort, remotePort) {
        try {
            if (!this.client?.portForward) {
                throw new Error('Port forwarding client not initialized')
            }

            return await this.client.portForward.forward(
                namespace,
                pod,
                [localPort],
                remotePort
            )
        } catch (error) {
            console.error('Port forward failed:', error)
            this.emitError(error, 'startPortForward')
            throw error
        }
    }

    cleanup() {
        this.client = null
        this.emitStatusChange('disconnected')
        this.errorHandlers.clear()
        this.statusHandlers.clear()
    }
}

module.exports = K8sClientHandler