# 助手返回恢复与业务查询覆盖

版本：1.2 · 2026-10-27 · 状态：PR #89 已合并部署，真实使用待用户验收。

## 本次概要与目标

用户反馈离开工作台再返回时，助手先出现“选择工作空间”，随后重新载入历史；初一十班已有班长但助手回答没有。用户取消会话删除需求，批准排查返回状态恢复、盘点业务查询覆盖并先补齐班级与学生信息。

## 事实、假设与未决问题

- 母文件夹与最新 origin/main 为 3d9f8d4；独立分支 codex/assistant-restore-query。
- App 仅在工作台或从工作台进入课堂任务时挂载 Workbench；进入其他业务页面会卸载其内的助手 iframe。
- 官方 UI 等工作区和会话列表就绪后才恢复选择；青松 ready 信号当前仅等待列表，没有等待选择恢复。工作区选择页可能是恢复中的中间态，需实际壳层复现。
- 查询只开放 classes、roster、schedule、classroom。rosterRepository 已有班委任职，teachingQueries 在投影时丢弃 committeeRoleIds。
- 未查询生产初一十班记录；不把样本测试作为该班实际任职的证明。

## 最短路径与备选方案

1. 先复现离开、返回链路；保留已访问工作台中的助手实例，离开时关闭手机模态层，返回恢复已有页面。完整刷新仍由官方恢复逻辑处理，不引入第二套会话选择状态。
2. 统一 qingsong_query 入口，按业务对象扩充查询。先补班委角色、任职及班级学生基础信息，并明确已开放与未开放的数据范围；不为每个按钮或数据表另造工具。
3. 当前不开放任意 SQL、联系人/家庭信息、业务写入，不做会话删除。其余资料/批改等缺口记录在覆盖清单，不在本轮接通。

备选为每次重载后自行持久化并恢复会话 ID，但这会和官方导航产生双重状态；延长服务端空闲时间不能解决页面卸载，故不采用。

## 修改范围

- src/App.tsx、src/features/workbench/Workbench.tsx、必要的 src/features/assistant/AssistantPanel.tsx：工作台生命周期、可见性、手机模态及恢复反馈。
- server/services/assistant/teachingQueries.ts、officialResponses.ts 与相关测试：查询覆盖、班委与名单、未支持查询的明确结果。
- agent/official-teaching.mjs、agent/official-ui/client.js（仅恢复反馈需要时）：工具契约和恢复反馈，不修改用户定稿的 system prompt。
- docs 本文与 PROJECT_HANDOFF.md：证据、查询覆盖、验收限制。

## 风险与验证

保留 iframe 会保留一个已访问的前端运行实例，不能通过长期缓存绕过后端登录校验；退出登录必须销毁。隐藏工作台不得留下顶层手机模态或可操作入口。查询继续继承服务端教师/工作区身份，并区分未任职、未支持、失败及截断。

使用隔离样本账号、真实官方进程与本机 fake SSE；检查桌面/窄屏/较矮屏幕的离开返回、草稿与历史、手机关闭再开、完整刷新和退出登录；定向查询与隔离测试、类型检查、构建。初始仅批准本地实现；用户随后明确要求推送部署，追加推送、PR、合并、备份及部署授权，不发起真实供应商调用。

## 修改历史

- 1.0：记录用户批准的修复范围、当前证据、推荐路径与验证边界。
- 1.1：保留已访问工作台、离开时关闭助手模态；补齐班委任职与能力查询；记录查询覆盖及本机验证。
- 1.2：用户追加发布授权，记录 PR #89、服务器检查、在线恢复点和生产切换；真实体验待验收。

## 最终实现

- App 记住是否访问过工作台；访问过后切换业务页面只隐藏 Workbench，不卸载助手 iframe。直接进入课堂任务不提前启动助手，首次打开工作台时才挂载。
- Workbench 新增 active 状态，离开时关闭手机/桌面 dialog 并清除手机打开状态；返回桌面直接显示，手机通过原按钮重开。退出登录由原 AuthGate 卸载 App，销毁所有保留的界面。没有新增会话 ID 缓存、持久化导航或第二套恢复逻辑。
- roster 返回角色目录、学生实际任职（角色 ID 和名称）、在籍状态、查询字段范围；仍不输出联系人和家庭信息。目录有岗位不等于有人任职。未解析角色标记 partial，不能给出完整性结论。
- 新增 capabilities 查询，说明已开放与缺失能力。未支持 kind 明确返回 QUERY_UNSUPPORTED，工具描述要求区分未开放、失败、缺字段、截断与无记录。没有改动用户定稿的 system prompt。
- 不更改数据库结构、生产教学数据、会话归档/删除逻辑、登录与服务端权限校验、空闲回收时间或依赖版本。

## 业务数据覆盖盘点

下表针对 AI 的 qingsong_query，不代表普通业务页面没有这些功能。

| 数据对象 | 普通业务的数据入口 | AI 本轮状态 |
| --- | --- | --- |
| 班级基础信息与真实编号 | rosterRepository.listClasses | classes 已开放，含班级状态 |
| 在班/休学学生姓名、学号、性别、状态 | rosterRepository.listStudents | roster 已开放；转出/退学学生不在返回范围 |
| 班委岗位与实际任职 | committee_roles、committee_assignments，经 rosterRepository | 本轮补齐，含自定义岗位及一人多职 |
| 座位安排与讲台四旁座 | classroomRepository.getClassroomLayout | 未开放，不能根据名单推断座位 |
| 联系人、家庭信息、完整画像/观察历史 | 学生档案与画像服务 | 未开放，不通过名单查询隐式输出 |
| 课表与今日课程 | scheduleRepository.listScheduleItems | schedule 已开放 |
| 提醒日程 | scheduleRepository.listReminders | 未开放；课表查询不等于提醒查询 |
| 课堂任务与表现摘要 | classroomTaskService、classroomBehaviorService | classroom 已开放，需班级及日期；最多 30 条任务/100 条表现，截断为 partial |
| 任务逐人结果、参与者、纠错历史 | classroom-tasks 详情、history 等现有业务接口 | 未完整开放，不用任务列表代替逐人明细 |
| 资料、材料池、原文/OCR与知识结构 | resources、materialPool 现有业务接口 | 未开放 |
| 批改任务、评分及终审 | gradingTasks、gradingTaskManagement 现有业务接口 | 未开放 |
| 业务写入、账号与系统管理数据 | 各业务写入及管理接口 | 未开放给教学查询工具 |

后续仍按业务对象复用查询服务；是否拆分工具由参数/结果复杂度决定，不与页面按钮或数据库表一一对应。以上未开放项仅盘点，本轮没有擅自接通。

## 验证结果与限制

- 精确 Node24.22.1；类型检查、Vite 构建通过，原有大 chunk 提示保留。
- 查询、错误分类、预算、工作区隔离、名册定向测试 12/12；原生 DSH 测试 2/2，包含定稿提示词全文哈希契约。
- 完整双教师 HTTP 集成 1/1：本机 fake SSE 驱动 classes→真实classId→roster，读到本教师班长；另一教师数据不出现；capabilities 与未支持查询错误能经过真实官方工具链返回。原有会话/反馈持久化、取消/排队、重启恢复及退出登录撤权检查保留。
- 真实青松壳层、隔离样本账号：桌面连续前往班级管理、课表与日程、学生管理、课堂任务后返回，iframe 导航次数 0、原 frame 未 detach，历史表格和未发送草稿保留。隐藏工作台期间助手 dialog 不可访问。
- 390×667 与 390×500：手机助手关闭/重开 3 次，frame 未 detach、导航次数 0、历史与草稿保留；窄短屏发送和返回按钮可见，无页面横向溢出。手机前往课堂任务再返回，也保留同一个 frame 及历史草稿。
- 切换到另一个浏览器标签再返回，历史表格和草稿保留；完整刷新后由官方导航恢复原有历史与草稿。通过账号菜单退出登录后，助手 iframe 数量为 0。
- 已查看本机截图：output/playwright/restore-desktop.png、restore-mobile.png、restore-mobile-short.png。截图不含真实教师数据，不提交临时浏览器产物。手机表格使用内部横向滚动，不把表格列内容截断当作整页溢出。
- 原始本机日志：/tmp/qs-restore-targeted.log、qs-restore-native.log、qs-restore-integration.log、qs-restore-lint.log、qs-restore-build.log；浏览器快照在本 worktree 的 .playwright-cli/。
- 初轮扩充 fake 模型 fixture 时错误地把原生工具异常文本当作 JSON，导致一次集成失败；修正为仅解析班委成功查询的 JSON 后，完整集成通过。并非生产模型报错。
- 开发态切换和 HMR 观察到 SVG circle/pattern NaN 控制台信息，基线工作台卸载路径也出现；不以控制台完全无错作为本轮结论，不扩大到既有图形组件重构。
- 无真实供应商调用，未核对生产初一十班实际记录，未验证真实模型是否始终遵守能力范围、真机触控/软键盘、浏览器丢弃后台标签页或首次远程加载速度。完整刷新仍需重新加载并由官方恢复会话；本轮解决业务页面切换造成的重复加载，不承诺所有网络等待归零。

## 生产发布证据

- PR #89 合并为 `396548eb9052213a8c2f838c99ad69b199470860`。母文件夹 main 同步后打包，包 SHA256 为 `db349c11f61e5645e93368dd9b0f72a0982cfaf864c912b4ff118e8be63820ee`。
- 服务器确认根/agent 锁文件与旧版完全相同，继续使用 Node24.22.1，将旧版 Linux 依赖复制至新发布目录，未共享可写 node_modules；独立通过类型检查、构建、12项定向、2项原生及1项双教师HTTP集成测试，真实供应商调用0。
- 预检业务任务、旧助手任务均0；2个官方会话的执行与排队均0。停写后在线恢复点 `/var/lib/teacher-dashboard/backups/manual/product-2026-10-27-pre-restore-396548e` 含1305文件/7SQLite，独立校验通过。
- `current` 已切换至对应完整SHA发布目录。没有迁移、恢复或改写教学记录；切换前后7库的schema、表计数与内容哈希一致，完整性ok、外键错误0。旧 e2a52f3 release 及手工恢复点保留。
- 服务 active/running、NRestarts=0，备份timer active；回环和公网 live/ready 正常，匿名助手status为401。公网JS `index-BPlDHtbt.js` SHA256 `160d74e13d9d34ef117d49aee8f3cee1f51d162f737e1d35b7a570147343ebcc`，CSS `index-OxU_dGuI.css` SHA256 `862e0eeb993fec47501c25703aa3991f7e4f0069f724ce25a1883c3f2519a0cd`，均匹配新release。
- 传输/SSH曾中断，改用独立 transient systemd 构建与切换任务，读取 Result/退出状态和日志确认，未盲目重跑部署。首轮切换在备份前中止：旧应用停服15秒触发 `server_shutdown_forced`，systemd标记failed而非inactive；恢复步骤启动旧版。后续以主进程0及业务端口关闭确认停写，再完成备份和切换。原应用退出等待问题未在本轮扩改，需后续独立排查。
- 发布日志：服务器 `/tmp/qs-restore-prod-{lint,build,test,unit,http}.log`，journal中的 `qs-restore-build-396548e`、`qs-restore-cutover-396548e-r2`；数据库核对摘要 `/tmp/qs-restore-{stopped,after}.json`。
- 用户原账号刷新 `https://td.unreached.top/` 测试业务页面返回及班长查询。构建、fixture和health均不能替代真实模型/真实班级/真机验收。
