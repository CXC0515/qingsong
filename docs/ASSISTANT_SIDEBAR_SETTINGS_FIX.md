# 会话侧栏设置入口被隐藏

版本：1.0 · 2026-10-28 · 状态：PR #97已合并部署，待用户确认入口显示。

现象：用户报告正式站没有侧栏设置图标。PR #95确已部署，但新按钮注册在原生sidebar.footer.action，旧shell.css仍对其父容器.hHd-Xa_footerActions使用display:none!important，且留有旧sidebar.footer整块隐藏规则。上次review只检查入口注册，漏查祖先CSS可见性，代码/健康检查通过不能证明入口可见。

本次沿原批准的设置范围修复：删除已冲突的底部隐藏规则，保留.hHd-Xa_settingsArea原生管理入口隐藏和收起侧栏时隐藏齿轮；不升级DSH、不改权限/提示词、不改业务或数据。其他footer动作提供者ui-cordis、cordis-client-runner仍被正式配置禁用，避免因显示容器而扩大功能范围。

文件：agent/official-ui/shell.css；agent/official-runtime.test.mjs；本记录及PROJECT_HANDOFF。最短路径是移除冲突，备选叠加更强显示规则会保留双重逻辑，不采用。

检查：Node中实际载入UI插件注册器，以React服务端渲染验证按钮/图标和父页面消息，再检查无条件隐藏祖先规则；原生进程检查验证正式插件配置与原生管理隔离。检查不运行浏览器、不证明实际布局，网页由用户验收。按既有PR/母文件夹打包/备份部署授权交付，保留旧代码和恢复点，不扩大清理生产备份范围。

## 发布证据

- PR #97：https://github.com/CXC0515/qingsong/pull/97，合并提交8c8850fb70b36febeceea136adcb56c59879dff5。母文件夹main打包，SHA256 00cba8b0994b647ada2bccde1a79f02d3898e65cdaf4c12b4677cb32cb7ad0c6，服务器回读一致。
- 本机类型/构建及3项原生/入口检查通过；服务器Node24.22.1重新类型/构建和3项检查通过。UI检查通过注册器和React服务端渲染验证入口及消息，CSS守卫确认旧隐藏规则会被检测；没有浏览器或真实模型调用。
- qs-sidebar-build-8c8850f、qs-sidebar-switch-8c8850f均成功，ExecMainStatus0且有BUILD_VERIFIED/DEPLOY_VERIFIED。current已指向新完整SHA目录，active/running，MainPID1818933，NRestarts0；线上CSS仅隐藏原生settingsArea，旧footerActions隐藏规则已不存在。
- 切换前后台活动作业0；8SQLite完整性/外键通过，切换前后schema和表计数一致。此修复不改数据，复验既有1317文件/8库恢复点product-2026-10-28-pre-settings-v2-c3e9297，没有新增数据备份。上一版c3e9297代码保留用于回滚。
- 修复前只读审计：历史发布目录约20GB、手工备份约1.4GB。未授权扩大清理，本次只删除已定位的冲突CSS；旧代码和备份的后续删除需明确清单与恢复边界。
