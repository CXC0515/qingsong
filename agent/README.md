# 青松 DSH 接入包

固定Node24.22.1及官方DSH/SDK0.2.1-rc.3；DSH负责原生模型循环、工具调度和持久会话。根应用通过runtime.mjs与model-admin.mjs接入，teaching-plugin.mjs只提供受控教学查询及增量反馈，不重写模型协议。

安装：`npm ci --prefix agent --no-audit --no-fund`。探针：`npm run probe --prefix agent`；原生工具/增量/恢复/循环上限：`node --test agent/integration.test.mjs`。两者只访问本机fixture，不调用真实模型。

教师入口为青松工作台；模型管理复用DSH原生Web，受青松owner鉴权。运行策略、配置权威、身份与凭据边界及未交付能力见[基础助手](../docs/ASSISTANT_BASELINE.md)，生产事实见[交接](../docs/PROJECT_HANDOFF.md)。
