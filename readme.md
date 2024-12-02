# KubeConnector

KubeConnector 是一个跨平台的桌面应用程序，用于管理和简化 Kubernetes 的端口转发操作。它提供了一个直观的图形界面，让用户能够轻松地管理多个集群的端口转发。

## 功能特点

- 多集群支持：可以管理多个 Kubernetes 配置文件和上下文
- 直观的端口转发管理：
  - 快速查看所有命名空间和 Pod
  - 轻松设置端口转发规则
  - 一键开启/停止端口转发
- 实时状态监控：显示每个端口转发的运行状态
- 跨平台支持：支持 Windows、macOS 和 Linux
- 简单易用的图形界面：无需记忆复杂的命令行参数

## 安装要求

- 已安装 kubectl 命令行工具
- 已配置好的 Kubernetes 配置文件（通常在 ~/.kube/config）
- 对集群有足够的访问权限

## 安装方法

### 从发布版本安装

1. 访问 [Releases](https://github.com/yourusername/kube-connector/releases) 页面
2. 下载适合你操作系统的安装包：
   - Windows: `KubeConnector-Setup.exe`
   - macOS: `KubeConnector.dmg`
   - Linux: `KubeConnector.AppImage` 或 `kube-connector.deb`
3. 运行安装程序

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/yourusername/kube-connector.git
cd kube-connector

# 安装依赖
npm install

# 启动开发版本
npm start

# 构建生产版本
npm run dist
```

## 使用方法

1. 启动应用程序后，从下拉菜单中选择你的 Kubernetes 配置文件
2. 选择要使用的上下文（Context）
3. 选择命名空间（Namespace）
4. 从列表中选择要转发的 Pod
5. 选择要转发的端口
6. 设置本地端口（如果需要自定义）
7. 点击"Add"按钮开始端口转发

### 管理端口转发

- 启动/停止：使用每个转发规则旁边的按钮控制
- 查看状态：可以实时查看每个转发的状态（运行中/已停止）
- 删除规则：点击对应的删除按钮移除转发规则

## 常见问题

1. **应用程序无法启动**
   - 检查 Kubernetes 配置文件权限

2. **端口转发失败**
   - 确保目标端口未被占用
   - 检查网络连接
   - 验证集群访问权限

3. **找不到 Pods**
   - 确保选择了正确的命名空间
   - 检查 Pod 是否在运行状态
   - 验证集群连接是否正常

## 开发指南

### 项目结构

```
kube-connector/
├── build/              # 构建资源
├── main.js            # 主进程
├── preload.js         # 预加载脚本
├── renderer.js        # 渲染进程
├── index.html         # 主界面
└── package.json       # 项目配置
```

### 开发命令

```bash
# 启动开发环境
npm start

# 启动调试模式
npm run debug

# 构建特定平台
npm run dist:win     # Windows
npm run dist:mac     # macOS
npm run dist:linux   # Linux

# 构建所有平台
npm run dist
```

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 联系方式

- 项目维护者：[Your Name]
- Email: <your.email@example.com>
- 项目链接：[https://github.com/yourusername/kube-connector](https://github.com/yourusername/kube-connector)

## 致谢

- Electron
- Kubernetes
- 所有贡献者

## 版本历史

- 1.0.0 (2024-01-01)
  - 初始发布
  - 基本端口转发功能
  - 多集群支持
