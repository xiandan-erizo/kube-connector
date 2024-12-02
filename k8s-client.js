const k8s = require('@kubernetes/client-node')
const net = require('net');
const stream = require('stream');

class K8sClientHandler {
    constructor() {
        this.client = null
        this.connectionStatus = 'disconnected'
        this.errorHandlers = new Set()
        this.statusHandlers = new Set()
        this.retryAttempts = 0
        this.maxRetries = 3
        this.retryDelay = 1000 // 1秒
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
            code: error.code,
            details: error.stack,
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
        this.retryAttempts = 0
        return this.initializeWithRetry(configPath)
    }

    async initializeWithRetry(configPath) {
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
                this.setupClient(kc)
                this.emitStatusChange('connected')
                console.log('Successfully connected to current context:', currentContext)
                return true
            }

            // 如果当前上下文失败，尝试其他上下文
            for (const ctx of contexts) {
                if (ctx.name !== currentContext && await this.validateConnection(kc, ctx.name)) {
                    this.setupClient(kc)
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

            // 重试逻辑
            if (this.retryAttempts < this.maxRetries) {
                this.retryAttempts++
                console.log(`Retrying initialization (attempt ${this.retryAttempts})...`)
                await new Promise(resolve => setTimeout(resolve, this.retryDelay))
                return this.initializeWithRetry(configPath)
            }

            return false
        }
    }

    setupClient(kc) {
        this.client = {
            core: kc.makeApiClient(k8s.CoreV1Api),
            apps: kc.makeApiClient(k8s.AppsV1Api),
            portForward: new k8s.PortForward(kc),
            kubeConfig: kc
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
                this.setupClient(this.client.kubeConfig)
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

    getCurrentContext() {
        try {
            if (!this.client?.kubeConfig) {
                throw new Error('Kubernetes client not initialized')
            }
            return this.client.kubeConfig.getCurrentContext()
        } catch (error) {
            this.emitError(error, 'getCurrentContext')
            return null
        }
    }

    getContexts() {
        if (!this.client?.kubeConfig) return []

        try {
            const contexts = this.client.kubeConfig.getContexts()
            const currentContext = this.client.kubeConfig.getCurrentContext()

            return contexts.map(ctx => ({
                name: ctx.name,
                cluster: ctx.cluster,
                namespace: ctx.namespace || 'default',
                user: ctx.user,
                isCurrent: ctx.name === currentContext
            }))
        } catch (error) {
            console.error('Failed to get contexts:', error)
            this.emitError(error, 'getContexts')
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
                    ready: pod.status.containerStatuses?.find(cs => cs.name === c.name)?.ready || false,
                    restartCount: pod.status.containerStatuses?.find(cs => cs.name === c.name)?.restartCount || 0,
                    ports: c.ports || []
                })),
                creationTimestamp: pod.metadata.creationTimestamp,
                nodeName: pod.spec.nodeName
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
                throw new Error('Kubernetes client not initialized');
            }

            if (!namespace || !podName) {
                throw new Error(`Invalid parameters: namespace=${namespace}, podName=${podName}`);
            }

            console.log('Fetching pod ports:', { namespace, podName });

            const response = await this.client.core.readNamespacedPod(podName, namespace);
            if (!response || !response.body || !response.body.spec) {
                throw new Error('Invalid pod response from API');
            }

            const containers = response.body.spec.containers || [];
            return containers.flatMap(container => {
                return (container.ports || []).map(port => ({
                    containerName: container.name,
                    containerPort: port.containerPort,
                    protocol: port.protocol || 'TCP',
                    name: port.name || `${port.containerPort}/${port.protocol || 'TCP'}`
                }));
            });
        } catch (error) {
            console.error('Failed to get pod ports:', {
                namespace,
                podName,
                error: error.message,
                stack: error.stack
            });
            this.emitError(error, 'getPodContainerPorts');
            return [];
        }
    }
    async startPortForward(namespace, pod, localPort, remotePort) {
        try {
            if (!this.client?.portForward) {
                throw new Error('Kubernetes client not initialized');
            }
            console.log('Starting port forward:', { namespace, pod, localPort, remotePort });

            // 验证Pod状态
            const podResponse = await this.client.core.readNamespacedPod(pod, namespace);
            const podStatus = podResponse.body.status.phase;
            if (podStatus !== 'Running') {
                throw new Error(`Pod is not running (status: ${podStatus})`);
            }

            return new Promise((resolve, reject) => {
                // 创建本地服务器
                const server = net.createServer((socket) => {
                    console.log('Client connected to port forward');

                    // 为每个连接创建流
                    const input = new stream.Readable({
                        read() { }
                    });

                    const output = new stream.Writable({
                        write(chunk, encoding, callback) {
                            if (!socket.destroyed) {
                                socket.write(chunk, callback);
                            } else {
                                callback();
                            }
                        }
                    });

                    // 处理socket数据
                    socket.on('data', (data) => {
                        input.push(data);
                    });

                    socket.on('end', () => {
                        input.push(null);
                    });

                    socket.on('error', (err) => {
                        console.error('Socket error:', err);
                        input.push(null);
                    });

                    // 创建端口转发
                    this.client.portForward.portForward(
                        namespace,
                        pod,
                        [remotePort],
                        output,
                        output, // 使用同一个输出流处理错误
                        input,
                        3
                    ).then((ws) => {
                        console.log('Port forward connection established');

                        // 清理函数
                        const cleanup = () => {
                            console.log('Cleaning up port forward connection');
                            if (typeof ws === 'function') {
                                const wsConn = ws();
                                if (wsConn) {
                                    wsConn.close();
                                }
                            } else if (ws) {
                                ws.close();
                            }
                            input.destroy();
                            output.destroy();
                            if (!socket.destroyed) {
                                socket.destroy();
                            }
                        };

                        // 处理 WebSocket 关闭
                        if (typeof ws === 'function') {
                            const wsConn = ws();
                            if (wsConn) {
                                wsConn.on('close', cleanup);
                                wsConn.on('error', (err) => {
                                    console.error('WebSocket error:', err);
                                    cleanup();
                                });
                            }
                        } else if (ws) {
                            ws.on('close', cleanup);
                            ws.on('error', (err) => {
                                console.error('WebSocket error:', err);
                                cleanup();
                            });
                        }

                        socket.on('close', cleanup);

                    }).catch((err) => {
                        console.error('Port forward error:', err);
                        if (!socket.destroyed) {
                            socket.destroy();
                        }
                    });
                });

                // 处理服务器错误
                server.on('error', (err) => {
                    console.error('Server error:', err);
                    reject(err);
                });

                // 开始监听
                server.listen(localPort, '127.0.0.1', () => {
                    console.log(`Port forward server listening on localhost:${localPort}`);
                    resolve({
                        close: () => {
                            return new Promise((resolveClose) => {
                                server.close(() => {
                                    console.log('Port forward server closed');
                                    resolveClose();
                                });
                            });
                        },
                        localPort,
                        remotePort
                    });
                });
            });

        } catch (error) {
            console.error('Failed to start port forward:', error);
            this.emitError(error, 'startPortForward');
            throw error;
        }
    }
    async watchPodEvents(namespace, podName, callback) {
        try {
            if (!this.client?.core) {
                throw new Error('Kubernetes client not initialized')
            }

            const watch = new k8s.Watch(this.client.kubeConfig)
            return watch.watch(
                `/api/v1/namespaces/${namespace}/pods/${podName}`,
                {},
                (type, apiObj) => {
                    callback({ type, object: apiObj })
                },
                (error) => {
                    if (error) {
                        this.emitError(error, 'watchPodEvents')
                    }
                }
            )
        } catch (error) {
            console.error('Failed to watch pod events:', error)
            this.emitError(error, 'watchPodEvents')
            return null
        }
    }
    async getServicePortsForPod(namespace, podName) {
        try {
            if (!this.client?.core) {
                throw new Error('Kubernetes client not initialized');
            }

            // 获取 Pod 的标签
            const pod = await this.client.core.readNamespacedPod(podName, namespace);
            const podLabels = pod.body.metadata.labels;

            if (!podLabels) {
                return [];
            }

            // 获取命名空间中的所有 Service
            const services = await this.client.core.listNamespacedService(namespace);

            // 找到匹配 Pod 标签的 Service
            const matchingServices = services.body.items.filter(svc => {
                const selector = svc.spec.selector;
                if (!selector) return false;

                // 检查 Service 的选择器是否匹配 Pod 的标签
                return Object.entries(selector).every(([key, value]) =>
                    podLabels[key] === value
                );
            });

            // 获取 Service 端口信息
            const servicePorts = matchingServices.flatMap(svc => {
                return (svc.spec.ports || []).map(port => ({
                    serviceName: svc.metadata.name,
                    servicePort: port.port,
                    targetPort: port.targetPort,
                    protocol: port.protocol || 'TCP',
                    name: port.name || `${port.port}/${port.protocol || 'TCP'}`,
                    nodePort: port.nodePort
                }));
            });

            // 获取 Pod 的容器端口作为参考
            const containerPorts = pod.body.spec.containers.flatMap(container => {
                return (container.ports || []).map(port => ({
                    containerName: container.name,
                    containerPort: port.containerPort,
                    protocol: port.protocol || 'TCP'
                }));
            });

            // 返回组合信息
            return {
                servicePorts,
                containerPorts,
                hasService: servicePorts.length > 0
            };

        } catch (error) {
            console.error('Failed to get service ports:', error);
            this.emitError(error, 'getServicePortsForPod');
            return {
                servicePorts: [],
                containerPorts: [],
                hasService: false
            };
        }
    }

    cleanup() {
        this.client = null
        this.emitStatusChange('disconnected')
        this.errorHandlers.clear()
        this.statusHandlers.clear()
        this.retryAttempts = 0
    }
}

module.exports = K8sClientHandler