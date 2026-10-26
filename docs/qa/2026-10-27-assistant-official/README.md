# 官方教学助手本地检查

版本1.0 · 2026-10-27 · 状态：代码及本机fixture检查，待用户真实验收。

## 自动检查

- Node24.22.1；DSH0.2.1-rc.3；类型检查通过，Vite构建通过（保留原有大chunk提示）。
- node --test agent/official-runtime.test.mjs：2/2，官方真实进程启动、插件/CSS、模型目录、qingsong preset及停止，危险调用/附件/超长队列拒绝。
- node --import tsx --test server/services/assistant/officialAssistant.test.ts server/services/assistant/officialBudget.test.ts server/routes/assistant.test.ts：5/5；真实青松登录+真实官方Web/会话，本机fake SSE，无供应商调用。
- 覆盖两教师会话/数据/反馈不可跨读；HTTP配置/凭据/目录拒绝；危险WS订阅断开，job/list只读订阅+原生WS ping可保持；原生cookie不下发；固定只读locale；反馈保存→进程重启→回读→更新→撤销；同会话连续两轮；排队取消、执行取消、再发送；退出登录后HTTP拒绝及WS15秒撤权。共享预算单测1执行+3排队、FIFO、超额/取消/错lease释放。

## 页面观察

实际青松工作台壳层，独立样本登录。桌面1440×1000、手机390×667、窄短390×500。发送→过程→Markdown表格→来源链接→复制/赞踩入口；反馈提交成功；历史选择、刷新恢复；新会话后可再次发送。源链接弹出青松新窗口。

- [桌面回答](desktop.png)、[手机回答](mobile.png)、[短屏回答](short.png)
- [桌面空会话](desktop-empty.png)、[手机空会话](mobile-empty.png)

空态输入保持底部，小灰欢迎语保留；工作区/文件/编程权限入口隐藏。390px宽文档无横向溢出。较矮视口可滚到助手，输入与发送可见。截图已人工查看；桌面第一次截图有截图拼接时壳层残影，不作为像素基准，空会话图无该残影。

检查中发现并修复：初始两次导航与官方恢复竞争；新会话缺workspace；误拦job/list导致重连；界面ready超时误报。最终登录态页面没有插件加载或settings/mutate错误；iframe同源sandbox提示不等于安全隔离，实际权限在服务端。

本机两名教师DSH进程约430MB RSS，未测生产容量、真实模型延迟/重试成本、真实手机软键盘/真机触控。固定样本回答不代表模型效果。用户负责主要真实软件验收。

## 原始记录

本机日志：/tmp/qs-final-suite.log、/tmp/qs-runtime.log、/tmp/qs-lint.log、/tmp/qs-build.log；浏览器快照/console在本worktree .playwright-cli/（不提交、不清理）。预览日志/tmp/qs-official-preview.log、/tmp/qs-official-vite.log。日志不含真实教师数据，fixture凭证不是生产凭证。

## 1.1 用户反馈修正 / 2026-10-27

- 原问题：弹窗内容层7px margin与玻璃外缘形成两侧多余白边；历史用了自建class和官方状态两套开关，内置收起后空白覆盖层残留；输入底部没有留白。
- 复用 liquid-glass skill 现有运行时，不改光学算法。弹窗移除内容外margin，统一28px圆角和裁切，保留原生模态、焦点及关闭行为。
- 官方界面放在12px留白、18px圆角容器内；输入座位保留18px加安全区底部留白。删除qs-history自建覆盖层，只用官方sidebar状态；容器窄于650px时历史占整块内容区，收起恢复正文，宽时并列。
- 内置浏览器实际查看桌面、390×667及390×500；重复外层历史/内部收起、选择历史后收起、空会话、原有消息、班级选择弹窗、模型菜单。未见原有两侧白边和收起残留。小屏选会话后通过收起按钮返回正文，沿用官方行为。真机软键盘未验；不声称SVG折射跨浏览器验证。
- 类型检查、构建通过（原有chunk提示保留），无后端改动、真实模型调用或部署。最终页面已恢复桌面、登录态空会话。
