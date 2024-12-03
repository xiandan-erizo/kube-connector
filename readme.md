# KubeConnector

A lightweight desktop application for managing Kubernetes port-forwarding operations across multiple contexts and clusters.

## Features

- 🔄 Multi-cluster support with context switching
- 🚀 Easy-to-use port forwarding interface
- 🔍 Pod and namespace discovery
- 📊 Service port detection and mapping
- ⚡ Fast and reliable connection management
- 🔒 Secure connection handling with retry mechanisms
- 💻 Cross-platform support (Windows, macOS, Linux)

## Installation

### Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Electron

### Building from Source

1. Clone the repository:

```bash
git clone https://github.com/yourusername/kube-connector.git
cd kube-connector
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Start the application:

```bash
npm start
# or
yarn start
```

### Building Distributions

Build for all platforms:

```bash
npm run dist
```

Platform-specific builds:

```bash
# Windows
npm run dist:win

# macOS
npm run dist:mac

# Linux
npm run dist:linux
```

## Usage

1. Launch the application
2. Select your kubeconfig file from the dropdown menu
3. Choose the desired Kubernetes context
4. Select namespace and pod
5. Configure local and remote ports
6. Start port forwarding

## Development

For development mode with hot reload:

```bash
npm run debug
```

## Project Structure

- `main.js` - Electron main process
- `k8s-client.js` - Kubernetes client handler
- `preload.js` - Preload script for security
- `renderer.js` - Frontend logic
- `index.html` - Main UI

## Contributing

Feel free to submit issues and enhancement requests!

## Authors

- Claude (AI Assistant) - Initial documentation and project structure
- [xiandan]

## License

This project is licensed under the Apache License 2.0 - see the LICENSE file for details.

```
Copyright 2024 KubeConnector

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

## Acknowledgments

- Built with Electron and @kubernetes/client-node
- Thanks to the Kubernetes community for excellent documentation

---
*Last updated: December 2024*

---

# KubeConnector (中文文档)

KubeConnector 是一个轻量级桌面应用程序，用于管理多个 Kubernetes 集群的端口转发操作。

## 主要特性

- 🔄 支持多集群管理和上下文切换
- 🚀 简单直观的端口转发界面
- 🔍 自动发现 Pod 和 Namespace
- 📊 智能检测和映射服务端口
- ⚡ 快速可靠的连接管理
- 🔒 具有重试机制的安全连接处理
- 💻 跨平台支持（Windows、macOS、Linux）

## 安装说明

### 运行环境要求

- Node.js（v14 或更高版本）
- npm 或 yarn
- Electron

### 从源码构建

1. 克隆仓库：

```bash
git clone https://github.com/yourusername/kube-connector.git
cd kube-connector
```

2. 安装依赖：

```bash
npm install
# 或
yarn install
```

3. 启动应用：

```bash
npm start
# 或
yarn start
```

### 打包发布版本

构建所有平台版本：

```bash
npm run dist
```

构建特定平台版本：

```bash
# Windows 版本
npm run dist:win

# macOS 版本
npm run dist:mac

# Linux 版本
npm run dist:linux
```

## 使用说明

1. 启动应用程序
2. 从下拉菜单选择 kubeconfig 文件
3. 选择目标 Kubernetes 上下文
4. 选择命名空间和 Pod
5. 配置本地和远程端口
6. 开始端口转发

## 开发指南

启动开发模式（支持热重载）：

```bash
npm run debug
```

## 项目结构

- `main.js` - Electron 主进程
- `k8s-client.js` - Kubernetes 客户端处理程序
- `preload.js` - 安全预加载脚本
- `renderer.js` - 前端逻辑
- `index.html` - 主界面

## 参与贡献

欢迎提交问题和功能改进建议！

## 作者

- Claude (AI助手) - 初始文档和项目结构
- [xiandan]

## 开源协议

本项目采用 Apache License 2.0 协议 - 详见 LICENSE 文件。

```
Copyright 2024 KubeConnector

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

## 致谢

- 基于 Electron 和 @kubernetes/client-node 构建
- 感谢 Kubernetes 社区提供的优秀文档

---
*最后更新：2024年12月*
