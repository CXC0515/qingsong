# 官方教学助手接入

版本：1.0 · 2026-10-27（Asia/Shanghai）
状态：用户批准本地代码集成；本地实现及样本检查完成，待用户验收。未 push、PR、合并、部署，未调用真实模型。
修改历史：1.0 将完整官方 Web 接入青松登录与只读教学工具，替代自制聊天呈现。

## 问题与最短路径

教师需要完整、好用的助手，不需要再造一套聊天组件。采用固定 DSH 0.2.1-rc.3 官方 Web、原生服务与插件；青松提供登录、UID/工作区、业务查询和总预算。保留已批准的空会话底部输入、小灰欢迎语。iframe 是界面容器，权限边界是服务端鉴权与每用户运行进程，不是 iframe sandbox。

用户已批准代码和交接，复用专项 worktree，切到从 origin/main@a53258b 创建的 codex/assistant-official-integration。旧原型分支 codex/assistant-official-ui-prototype@81e8366 保留。没有修改母文件夹、真实数据或线上服务。

备选是继续自制聊天前端，代价是重复维护流式、Markdown、过程、历史、输入和反馈；本轮不采用。共享一个全权限 DSH 实例仅依赖浏览器 UID 也不采用，因为调用者可以改 UID，且全局运行配置会混用。

## 实际链路

1. 教师登录青松，工作台加载 /api/assistant/official/。HTTP 每次检查青松登录；WS 建连同源且登录，之后每15秒复核撤权。
2. 服务端根据已认证 userId + workspaceId 哈希定位唯一 home 和原生进程；模型和浏览器均不能提交身份。会话 ID 只是该实例中的索引。
3. 青松服务端兑换官方启动 token，官方 cookie 留在服务端。模型配置仍以 system/assistant-models 为唯一来源；每个用户只同步 llm-pi-ai 凭据记录及必要 refs，保留自己的原生签名密钥。配置修订后，实例在没有在途请求时重启读取新配置，历史保留。
4. 官方 UI 自己完成编辑、发送、流式、Markdown/表格、过程折叠、模型选择、历史、复制/分支和赞踩。青松用官方插件/插槽、locale 扩展、uiWorkspace 服务；没有沿用原型 DOM 扫描/模拟点击。少量样式绑定 rc.3 类名，升级需复查。
5. qingsong_query 回到仅 loopback 监听的短期凭证桥；工具逐次验证有效青松登录，在固定工作区上下文读取现有业务服务。允许课表、名单、指定日期课堂任务/表现，无 SQL、文件、Shell、上传、通用命令或业务写入。
6. 每轮总预算：全局1执行+3排队，3分钟（含排队）、8步、12次查询、单次输出最多2048 tokens；正常原生 turn/end 后释放，取消不提前释放运行名额。190秒看门狗关闭卡死实例，确认进程退出后释放。原生内部重试不等于步骤计数。
7. 原生会话与反馈保存于个人数据目录 assistant/<sha256(uid,workspace)>/official；进程退出不删除。最多4实例、空闲10分钟回收；本机两实例 RSS 约430MB，仅测量点，不代表线上容量保证。

## 权限与旧记录

- HTTP 精确 endpoint 白名单；WS 对每个 logical open 重新检查，不裸透传。官方 job/list 只读状态订阅被允许；配置写入、凭据读取、目录和任意工具不可用。
- settings/describe 只返回固定只读 locale 投影，不暴露模型配置或其他 namespaces；settings/mutate 被拒绝。官方服务仍以 native owner 工作，外层 API 策略和禁用插件是必要权限边界，不能只隐藏按钮。
- 模型输入及队列编辑均只允许文本，最多8000字。现有 Express 请求体和 WS 每帧上限1MB。
- 旧 SDK 会话读取保留；旧创建、发送、取消接口统一410中文提示，不再启动第二套生成队列。旧存储不迁移、不删。
- 赞踩为官方会话事件，支持分类、说明、版本冲突控制、更新及撤销；不改 memory，不自动训练。没有反馈运营后台。
- 这是同一操作系统用户下的服务隔离，不是 OS 沙箱。用户独立 home、插件裁剪、工具 guard、端点校验要共同保留。官方 UI 客户端仍有按会话 ID 的浏览器偏好/草稿缓存；服务器历史与业务读取必须再次鉴权。

## 文件范围

- agent/model-admin.mjs：共用启动/停止能力，原模型管理保持默认参数行为。
- agent/official-runtime.mjs、official-teaching.mjs：原生 profile 裁剪、模型同步、教学工具与预算钩子。
- agent/official-policy.mjs、official-relay.mjs：HTTP/WS准入及会话撤权。
- agent/official-ui/：官方插件、locale 和局部样式。
- server/services/assistant/officialAssistant.ts、officialBudget.ts：身份映射、进程、转发、工具桥和共享排队。
- server/app.ts、server/index.ts：挂载与关闭；server/routes/assistant.ts：旧会话只读。
- src/features/assistant/AssistantPanel.tsx：官方容器及青松入口。
- 相关专项测试、交接与截图；agent 直接声明既有 ws@8.22.0，未升级 DSH 或全量依赖。

## 检查证据与边界

检查详情见 [本次 QA](qa/2026-10-27-assistant-official/README.md)。真实供应商调用、教师数据质量、真实手机软键盘、生产内存/代理超时仍待验收。未实现长期记忆、RAG、业务写入、组织共享、QQ和反馈后台。

本地预览用真实青松壳层、青松注册登录、两名隔离样本教师、临时数据库及本机假模型；假模型根据工具结果输出固定表格，不证明模型能力。源链接在新窗口打开青松。没有接生产数据。

## 预览及恢复

工作目录：/Users/cxc/.codex/worktrees/qingsong-harness-runtime/qingsong。
Node：/tmp/qingsong-node-v24.22.1-darwin-arm64/bin/node。

先确认端口4480/4475是否已是本专项进程，不覆盖其他服务。在上述目录分别运行：

    PATH=/tmp/qingsong-node-v24.22.1-darwin-arm64/bin:$PATH QS_NATIVE_PREVIEW=1 node --import tsx --test server/services/assistant/officialAssistant.test.ts
    PATH=/tmp/qingsong-node-v24.22.1-darwin-arm64/bin:$PATH API_PROXY_TARGET=http://127.0.0.1:4475 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4480 --strictPort

打开 http://localhost:4480/；样本 native-a@fixture.test / Fixture-password-12345，乙教师 native-b@fixture.test 同密码，仅临时样本。重启产生新的隔离数据根，旧登录需清 cookie 后重新登录。临时根由测试日志输出；不恢复旧数据库。本机检查结束仅关闭本专项进程，不清理未知目录。

正式接入已经替代旧原型服务；docs/prototypes/assistant-official 下 serve.mts 仅供历史复现，不能与当前预览占同端口，更不能直接上线。

## 下一步

用户先验收页面和真实使用范围。获新授权后再做真实模型/教师验收及上线准备，核对服务器容量和反向代理 WebSocket，再按 push→PR→合并→部署独立授权推进。当前不执行远端操作。
