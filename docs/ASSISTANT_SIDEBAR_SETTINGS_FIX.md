# 会话侧栏设置入口被隐藏

版本：1.0 · 2026-10-28 · 状态：修复与发布中。

现象：用户报告正式站没有侧栏设置图标。PR #95确已部署，但新按钮注册在原生sidebar.footer.action，旧shell.css仍对其父容器.hHd-Xa_footerActions使用display:none!important，且留有旧sidebar.footer整块隐藏规则。上次review只检查入口注册，漏查祖先CSS可见性，代码/健康检查通过不能证明入口可见。

本次沿原批准的设置范围修复：删除已冲突的底部隐藏规则，保留.hHd-Xa_settingsArea原生管理入口隐藏和收起侧栏时隐藏齿轮；不升级DSH、不改权限/提示词、不改业务或数据。其他footer动作提供者ui-cordis、cordis-client-runner仍被正式配置禁用，避免因显示容器而扩大功能范围。

文件：agent/official-ui/shell.css；agent/official-runtime.test.mjs；本记录及PROJECT_HANDOFF。最短路径是移除冲突，备选叠加更强显示规则会保留双重逻辑，不采用。

检查：Node中实际载入UI插件注册器，以React服务端渲染验证按钮/图标和父页面消息，再检查无条件隐藏祖先规则；原生进程检查验证正式插件配置与原生管理隔离。检查不运行浏览器、不证明实际布局，网页由用户验收。按既有PR/母文件夹打包/备份部署授权交付，保留旧代码和恢复点，不扩大清理生产备份范围。
