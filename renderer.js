// renderer.js
document.addEventListener('DOMContentLoaded', () => {
    // 初始化加载 Kubeconfig 列表
    window.electronAPI.loadKubeconfigList()

    // 重置选择函数
    const resetPodSelect = () => {
        const podSelect = document.getElementById('pod-select')
        podSelect.innerHTML = '<option value="">Select Pod...</option>'
        podSelect.disabled = true
    }

    const resetPortSelect = () => {
        const portSelect = document.getElementById('port-select')
        portSelect.innerHTML = '<option value="">Select Port...</option>'
        portSelect.disabled = true
        document.getElementById('port-info').innerHTML = ''
        document.getElementById('local-port-input').value = ''
    }

    const resetNamespaceSelect = () => {
        const namespaceSelect = document.getElementById('namespace-select')
        namespaceSelect.innerHTML = '<option value="">Select Namespace...</option>'
        resetPodSelect()
        resetPortSelect()
    }

    // Kubeconfig 选择事件
    document.getElementById('kubeconfig-select').addEventListener('change', (e) => {
        if (e.target.value) {
            window.electronAPI.selectKubeconfig(e.target.value)
            document.getElementById('context-select').innerHTML = '<option value="">Select Context...</option>'
            resetNamespaceSelect()
        } else {
            document.getElementById('context-select').innerHTML = '<option value="">Select Context...</option>'
            resetNamespaceSelect()
        }
    })

    // Context 选择事件
    document.getElementById('context-select').addEventListener('change', (e) => {
        if (e.target.value) {
            window.electronAPI.selectContext(e.target.value)
            resetNamespaceSelect()
        } else {
            resetNamespaceSelect()
        }
    })

    // Namespace 选择事件
    document.getElementById('namespace-select').addEventListener('change', (e) => {
        const namespace = e.target.value
        if (namespace) {
            window.electronAPI.getPods(namespace)
            resetPodSelect()
            resetPortSelect()
            document.getElementById('pod-select').disabled = false
        } else {
            resetPodSelect()
            resetPortSelect()
        }
    })

    // Pod 选择事件
    document.getElementById('pod-select').addEventListener('change', (e) => {
        const pod = e.target.value
        const namespace = document.getElementById('namespace-select').value
        if (pod && namespace) {
            window.electronAPI.getPodPorts(namespace, pod)
            resetPortSelect()
            document.getElementById('port-select').disabled = false
        } else {
            resetPortSelect()
        }
    })

    // 端口选择事件
    document.getElementById('port-select').addEventListener('change', (e) => {
        if (e.target.value) {
            const portInfo = JSON.parse(e.target.value)
            document.getElementById('local-port-input').value = portInfo.containerPort
        } else {
            document.getElementById('local-port-input').value = ''
        }
    })

    // Modal 控制
    window.showAddForwardModal = () => {
        document.getElementById('add-forward-modal').classList.add('show')
    }

    window.hideAddForwardModal = () => {
        document.getElementById('add-forward-modal').classList.remove('show')
        // 重置表单
        resetPortSelect()
        document.getElementById('namespace-select').value = ''
        resetPodSelect()
    }

    window.handleAddForward = () => {
        const namespace = document.getElementById('namespace-select').value
        const pod = document.getElementById('pod-select').value
        const localPort = document.getElementById('local-port-input').value
        const portInfo = JSON.parse(document.getElementById('port-select').value)
        const remotePort = portInfo.containerPort

        window.electronAPI.startPortForward({
            namespace,
            pod,
            localPort,
            remotePort
        })

        hideAddForwardModal()
    }

    window.toggleForward = (id) => {
        window.electronAPI.togglePortForward(id)
    }

    window.electronAPI.onContextsLoaded((event, contexts) => {
        const select = document.getElementById('context-select')
        select.innerHTML = '<option value="">Select Context...</option>'

        contexts.forEach(context => {
            const option = document.createElement('option')
            option.value = context.name
            option.textContent = `${context.name} (${context.cluster})`
            select.appendChild(option)
        })
    })

    window.electronAPI.onNamespacesLoaded((event, namespaces) => {
        const select = document.getElementById('namespace-select')
        select.innerHTML = '<option value="">Select Namespace...</option>'

        namespaces.forEach(namespace => {
            const option = document.createElement('option')
            option.value = namespace
            option.textContent = namespace
            select.appendChild(option)
        })
    })

    window.electronAPI.onPodsLoaded((event, pods) => {
        const select = document.getElementById('pod-select')
        select.innerHTML = '<option value="">Select Pod...</option>'

        pods.forEach(pod => {
            if (pod.status === 'Running') {  // 只显示运行中的 Pod
                const option = document.createElement('option')
                option.value = pod.name
                option.textContent = pod.name
                select.appendChild(option)
            }
        })
    })

    window.electronAPI.onPodPortsLoaded((event, ports) => {
        const select = document.getElementById('port-select')
        select.innerHTML = '<option value="">Select Port...</option>'

        ports.forEach(port => {
            const option = document.createElement('option')
            option.value = JSON.stringify(port)
            option.textContent = `${port.containerPort} (${port.protocol}) - ${port.container}${port.name ? ` (${port.name})` : ''}`
            select.appendChild(option)
        })

        const portInfo = document.getElementById('port-info')
        if (ports.length === 0) {
            portInfo.innerHTML = '<div class="alert alert-warning">No ports exposed in this pod</div>'
        } else {
            portInfo.innerHTML = ''
        }
    })

    window.electronAPI.onForwardsUpdated((event, forwards) => {
        const container = document.getElementById('forwards-container')
        container.innerHTML = ''

        forwards.forEach(forward => {
            const item = document.createElement('div')
            item.className = `forward-item ${forward.active ? 'active' : ''}`

            item.innerHTML = `
                <div>${forward.localPort}</div>
                <div>${forward.remotePort}</div>
                <div>${forward.pod}</div>
                <div>${forward.namespace}</div>
                <div>
                    <span class="status-dot ${forward.active ? 'active' : 'inactive'}"></span>
                    ${forward.active ? 'Running' : 'Stopped'}
                </div>
                <div>
                    <button class="stop-button" onclick="toggleForward('${forward.id}')">
                        ${forward.active ? 'Stop' : 'Start'}
                    </button>
                </div>
            `

            container.appendChild(item)
        })
    })

    window.electronAPI.onForwardOutput((event, { id, output }) => {
        console.log(`Port forward output (${id}):`, output)
    })

    window.electronAPI.onForwardError((event, { id, error }) => {
        console.error(`Port forward error (${id}):`, error)
    })

    // 初始化时加载 Kubeconfig 列表
    const loadInitialData = async () => {
        try {
            await window.electronAPI.loadKubeconfigList()
        } catch (error) {
            console.error('Error loading kubeconfig list:', error)
        }
    }

    loadInitialData()

    // Event Listeners
    window.electronAPI.onKubeconfigList((event, configs) => {
        console.log('Received kubeconfig list:', configs)
        const select = document.getElementById('kubeconfig-select')
        select.innerHTML = '<option value="">Select Kubeconfig...</option>'

        configs.forEach(config => {
            const option = document.createElement('option')
            option.value = config.path
            option.textContent = config.name
            select.appendChild(option)
        })
    })
})