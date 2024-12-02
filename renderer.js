// renderer.js
document.addEventListener('DOMContentLoaded', () => {
    // 状态管理
    let currentState = {
        kubeconfig: null,
        context: null,
        namespace: null,
        pod: null,
        port: null
    };

    // 统一的重置函数
    const resetSelections = {
        port: () => {
            const portSelect = document.getElementById('port-select');
            portSelect.innerHTML = '<option value="">Select Port...</option>';
            portSelect.disabled = true;
            document.getElementById('port-info').innerHTML = '';
            document.getElementById('local-port-input').value = '';
        },
        pod: () => {
            const podSelect = document.getElementById('pod-select');
            podSelect.innerHTML = '<option value="">Select Pod...</option>';
            podSelect.disabled = true;
            resetSelections.port();
        },
        namespace: () => {
            const namespaceSelect = document.getElementById('namespace-select');
            namespaceSelect.innerHTML = '<option value="">Select Namespace...</option>';
            namespaceSelect.disabled = true;
            resetSelections.pod();
        },
        context: () => {
            const contextSelect = document.getElementById('context-select');
            contextSelect.innerHTML = '<option value="">Select Context...</option>';
            contextSelect.disabled = true;
            resetSelections.namespace();
        },
        all: () => {
            resetSelections.context();
        }
    };

    // 统一的错误处理函数
    const handleError = (operation, error) => {
        console.error(`Error in ${operation}:`, error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = `Error: ${error.message || 'An unknown error occurred'}`;
        document.body.appendChild(errorDiv);

        setTimeout(() => {
            errorDiv.remove();
        }, 3000);
    };

    // Kubeconfig 相关事件处理
    const handleKubeconfigList = (configs) => {
        try {
            const select = document.getElementById('kubeconfig-select');
            select.innerHTML = '<option value="">Select Kubeconfig...</option>';

            configs.forEach(config => {
                const option = document.createElement('option');
                option.value = config.path;
                option.textContent = config.name;
                if (config.isActive) {
                    option.selected = true;
                    // 如果有活跃的配置，自动加载它
                    handleKubeconfigChange(config.path);
                }
                select.appendChild(option);
            });
        } catch (error) {
            handleError('kubeconfig-list-update', error);
        }
    };

    // 处理 Kubeconfig 变更
    const handleKubeconfigChange = async (configPath) => {
        try {
            if (!configPath) {
                resetSelections.all();
                return;
            }

            const result = await window.electronAPI.loadKubeconfig(configPath);
            if (result.success) {
                currentState.kubeconfig = configPath;
                updateContextSelect(result.contexts);
            } else {
                handleError('load-kubeconfig', new Error(result.error));
                resetSelections.all();
            }
        } catch (error) {
            handleError('kubeconfig-change', error);
            resetSelections.all();
        }
    };

    // 更新 Context 选择器
    const updateContextSelect = (contexts) => {
        const contextSelect = document.getElementById('context-select');
        contextSelect.innerHTML = '<option value="">Select Context...</option>';

        contexts.forEach(context => {
            const option = document.createElement('option');
            option.value = context.name;
            option.textContent = `${context.name} (${context.namespace || 'default'})`;
            if (context.isCurrent) {
                option.selected = true;
                handleContextChange(context.name);
            }
            contextSelect.appendChild(option);
        });

        contextSelect.disabled = false;
    };

    // Context 变更处理
    const handleContextChange = async (contextName) => {
        try {
            if (!contextName) {
                resetSelections.namespace();
                return;
            }

            const result = await window.electronAPI.switchContext(contextName);
            if (result.success) {
                currentState.context = contextName;
                const namespaces = await window.electronAPI.getNamespaces();
                updateNamespaceSelect(namespaces);
            } else {
                handleError('context-switch', new Error(result.error));
                resetSelections.namespace();
            }
        } catch (error) {
            handleError('context-change', error);
            resetSelections.namespace();
        }
    };

    // 更新 Namespace 选择器
    const updateNamespaceSelect = (namespaces) => {
        const namespaceSelect = document.getElementById('namespace-select');
        namespaceSelect.innerHTML = '<option value="">Select Namespace...</option>';

        namespaces.forEach(ns => {
            const option = document.createElement('option');
            option.value = ns.name;
            option.textContent = ns.name;
            namespaceSelect.appendChild(option);
        });

        namespaceSelect.disabled = false;
    };

    // Namespace 变更处理
    const handleNamespaceChange = async (namespace) => {
        try {
            if (!namespace) {
                resetSelections.pod();
                return;
            }

            const pods = await window.electronAPI.getPods(namespace);
            currentState.namespace = namespace;
            updatePodSelect(pods);
        } catch (error) {
            handleError('namespace-change', error);
            resetSelections.pod();
        }
    };

    // 更新 Pod 选择器
    const updatePodSelect = (pods) => {
        const podSelect = document.getElementById('pod-select');
        podSelect.innerHTML = '<option value="">Select Pod...</option>';

        pods
            .filter(pod => pod.status === 'Running')
            .forEach(pod => {
                const option = document.createElement('option');
                option.value = pod.name;
                option.textContent = pod.name;
                podSelect.appendChild(option);
            });

        podSelect.disabled = false;
    };

    // Pod 变更处理
    const handlePodChange = async (podName) => {
        try {
            if (!podName || !currentState.namespace) {
                resetSelections.port();
                return;
            }
            const ports = await window.electronAPI.getPodPorts(currentState.namespace, podName);
            currentState.pod = podName;
            updatePortSelect(ports);
        } catch (error) {
            handleError('pod-change', error);
            resetSelections.port();
        }
    };

    // 更新端口选择器
    const updatePortSelect = (ports) => {
        const portSelect = document.getElementById('port-select');
        portSelect.innerHTML = '<option value="">Select Port...</option>';

        if (ports.length === 0) {
            document.getElementById('port-info').innerHTML =
                '<div class="alert alert-warning">No ports exposed in this pod</div>';
            return;
        }

        ports.forEach(port => {
            const option = document.createElement('option');
            option.value = JSON.stringify(port);
            option.textContent = `${port.containerPort} (${port.protocol}) - ${port.containerName}`;
            portSelect.appendChild(option);
        });

        portSelect.disabled = false;
        document.getElementById('port-info').innerHTML = '';
    };

    // 端口转发处理
    const handleAddForward = async () => {
        try {
            const portSelect = document.getElementById('port-select');
            const localPort = document.getElementById('local-port-input').value;

            if (!currentState.namespace || !currentState.pod || !portSelect.value || !localPort) {
                throw new Error('Please fill in all required fields');
            }

            const portInfo = JSON.parse(portSelect.value);
            const result = await window.electronAPI.startPortForward({
                namespace: currentState.namespace,
                pod: currentState.pod,
                localPort: parseInt(localPort),
                // 使用 targetPort 作为远程端口，因为这是 Pod 实际监听的端口
                remotePort: typeof portInfo.targetPort === 'number' ?
                    portInfo.targetPort :
                    parseInt(portInfo.targetPort)
            });

            if (result.success) {
                hideAddForwardModal();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            handleError('add-forward', error);
        }
    };
    // 端口转发列表更新
    const handleForwardsUpdate = (forwards) => {
        try {
            const container = document.getElementById('forwards-container');
            container.innerHTML = '';

            forwards.forEach(forward => {
                const item = document.createElement('div');
                item.className = 'forward-item';

                // 创建本地端口链接
                const localPort = document.createElement('div');
                const localPortLink = document.createElement('a');
                localPortLink.href = `http://localhost:${forward.localPort}`;
                localPortLink.textContent = forward.localPort;
                localPortLink.className = 'local-port-link';
                localPortLink.onclick = (e) => {
                    e.preventDefault();
                    window.electronAPI.openExternal(`http://localhost:${forward.localPort}`);
                };
                localPort.appendChild(localPortLink);

                const remotePort = document.createElement('div');
                remotePort.textContent = forward.remotePort;

                const pod = document.createElement('div');
                pod.textContent = forward.pod;

                const namespace = document.createElement('div');
                namespace.textContent = forward.namespace;

                const status = document.createElement('div');
                status.className = `status ${forward.active ? 'running' : 'stopped'}`;
                status.textContent = forward.active ? 'Running' : 'Stopped';

                const actions = document.createElement('div');
                actions.className = 'action-buttons';

                const stopButton = document.createElement('button');
                stopButton.className = 'btn-stop';
                stopButton.textContent = forward.active ? 'Stop' : 'Start';
                stopButton.onclick = () => window.toggleForward(forward.id);

                const deleteButton = document.createElement('button');
                deleteButton.className = 'btn-delete';
                deleteButton.textContent = 'Delete';
                deleteButton.onclick = () => window.removeForward(forward.id);

                actions.appendChild(stopButton);
                actions.appendChild(deleteButton);

                // 将所有元素添加到 item 中
                item.appendChild(localPort);
                item.appendChild(remotePort);
                item.appendChild(pod);
                item.appendChild(namespace);
                item.appendChild(status);
                item.appendChild(actions);

                container.appendChild(item);
            });
        } catch (error) {
            handleError('forwards-update', error);
        }
    };
    // 事件监听器设置
    const setupEventListeners = () => {
        // Kubeconfig 选择
        document.getElementById('kubeconfig-select').addEventListener('change', (e) => {
            handleKubeconfigChange(e.target.value);
        });

        // Context 选择
        document.getElementById('context-select').addEventListener('change', (e) => {
            handleContextChange(e.target.value);
        });

        // Namespace 选择监听
        document.getElementById('namespace-select').addEventListener('change', async (e) => {
            const namespace = e.target.value;
            try {
                if (!namespace) {
                    resetSelections.pod();
                    currentState.namespace = null;
                    return;
                }

                currentState.namespace = namespace;
                const pods = await window.electronAPI.getPods(namespace);
                const podSelect = document.getElementById('pod-select');
                podSelect.innerHTML = '<option value="">Select Pod...</option>';

                pods
                    .filter(pod => pod.status === 'Running')
                    .forEach(pod => {
                        const option = document.createElement('option');
                        option.value = pod.name;
                        option.textContent = pod.name;
                        podSelect.appendChild(option);
                    });

                podSelect.disabled = false;
                resetSelections.port();
            } catch (error) {
                handleError('namespace-change', error);
                resetSelections.pod();
                currentState.namespace = null;
            }
        });
        // Pod 选择监听
        document.getElementById('pod-select').addEventListener('change', async (e) => {
            const podName = e.target.value;
            try {
                if (!podName || !currentState.namespace) {
                    resetSelections.port();
                    currentState.pod = null;
                    return;
                }

                const portInfo = await window.electronAPI.getPodPorts(currentState.namespace, podName);
                currentState.pod = podName;

                const portSelect = document.getElementById('port-select');
                portSelect.innerHTML = '<option value="">Select Port...</option>';

                const portInfoDiv = document.getElementById('port-info');

                if (!portInfo.hasService) {
                    portInfoDiv.innerHTML = '<div class="alert alert-warning">No Service found for this Pod</div>';
                    portSelect.disabled = true;
                    return;
                }

                if (portInfo.servicePorts.length === 0) {
                    portInfoDiv.innerHTML = '<div class="alert alert-warning">No ports exposed in Service</div>';
                    portSelect.disabled = true;
                    return;
                }

                // 添加 Service 端口选项
                portInfo.servicePorts.forEach(port => {
                    const option = document.createElement('option');
                    const portMapping = {
                        servicePort: port.servicePort,
                        targetPort: port.targetPort,
                        containerPort: portInfo.containerPorts.find(cp =>
                            cp.containerPort === (typeof port.targetPort === 'number' ?
                                port.targetPort :
                                parseInt(port.targetPort)
                            ))?.containerPort || port.targetPort,
                        protocol: port.protocol,
                        serviceName: port.serviceName
                    };

                    option.value = JSON.stringify(portMapping);

                    // 显示端口映射信息
                    const displayText = port.nodePort ?
                        `${port.servicePort}:${port.targetPort} (NodePort: ${port.nodePort}) - ${port.serviceName}` :
                        `${port.servicePort}:${port.targetPort} - ${port.serviceName}`;

                    option.textContent = displayText;
                    portSelect.appendChild(option);
                });

                portSelect.disabled = false;
                portInfoDiv.innerHTML = ''; // 清除任何警告消息

            } catch (error) {
                handleError('pod-change', error);
                resetSelections.port();
                currentState.pod = null;
            }
        });
        // Port 选择监听
        document.getElementById('port-select').addEventListener('change', (e) => {
            try {
                const portValue = e.target.value;
                if (!portValue) {
                    document.getElementById('local-port-input').value = '';
                    return;
                }

                const portInfo = JSON.parse(portValue);
                document.getElementById('local-port-input').value = portInfo.containerPort;
            } catch (error) {
                handleError('port-select', error);
                document.getElementById('local-port-input').value = '';
            }
        });

        // 添加端口转发按钮
        document.getElementById('add-forward-btn').addEventListener('click', handleAddForward);
    };

    // 连接状态更新处理
    const handleConnectionStatus = (status) => {
        const statusIndicator = document.createElement('div');
        statusIndicator.className = `connection-status ${status}`;
        statusIndicator.textContent = `Connection: ${status}`;

        const existingStatus = document.querySelector('.connection-status');
        if (existingStatus) {
            existingStatus.remove();
        }
        document.body.appendChild(statusIndicator);

        if (status === 'disconnected') {
            resetSelections.all();
        }
    };

    // 初始化
    const initialize = async () => {
        try {
            setupEventListeners();

            // 设置事件处理器
            window.electronAPI.onKubeconfigList(handleKubeconfigList);
            window.electronAPI.onNamespacesUpdated(updateNamespaceSelect);
            window.electronAPI.onForwardsUpdated(handleForwardsUpdate);
            window.electronAPI.onConnectionStatus(handleConnectionStatus);
            window.electronAPI.onK8sError((error) => handleError('k8s-error', error));

            // 加载初始数据
            await window.electronAPI.loadKubeconfigList();
        } catch (error) {
            handleError('initialization', error);
        }
    };

    // Modal 控制
    window.showAddForwardModal = () => {
        document.getElementById('add-forward-modal').classList.add('show');
    };

    window.hideAddForwardModal = () => {
        document.getElementById('add-forward-modal').classList.remove('show');
        resetSelections.port();
    };

    // 端口转发控制
    window.toggleForward = async (id) => {
        try {
            await window.electronAPI.stopPortForward(id);
        } catch (error) {
            handleError('toggle-forward', error);
        }
    };

    window.removeForward = async (id) => {
        try {
            await window.electronAPI.stopPortForward(id);
        } catch (error) {
            handleError('remove-forward', error);
        }
    };

    // 启动初始化
    initialize();
});