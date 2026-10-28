# 助手设置正式接入

版本：1.0 · 2026-10-28 · 状态：PR #95 已合并并部署，待用户网页/手机验收。

目标：按原型v0.10接入正式设置、个人Markdown指令及记忆管理，移除聊天常驻提示，通过展开会话侧栏左下角跳转。用户负责网页验收，Agent负责代码review、定向自动检查、PR、合并及备份部署。

事实：个人库已有记录、版本、来源与幂等；没有工作事项后端。假设：本次不实现业务写入、主动跟进或Memory框架。个人文档只合并无到期时间的生效规则，过期/限期/候选/停用规则保留可查看和管理；原记录与修订不删除。总有效规则仍限制3000字。

最短路径：复用GlassSegments、GlassButton、ResponsiveDialog、原个人SQLite和权限中间件；新增文档原子读写适配，不引入双重事实库或数据库迁移。备选整套重建Memory不在本次范围。

文件范围：PersonalContextPanel及其共享数据hook、domain/personalContext；personalContext服务、路由与定向检查；AssistantPanel与official-ui插件；SystemSettingsPanel、App及阈值偏好适配；product.css；本文件与交接。规范和原型沿用已确认分支记录。

风险：文档合并必须原子、冲突不可覆盖、超时重试不能重复；到期规则不可变成永久规则；私有数据不能跨用户；切换不能重建玻璃选中片或丢草稿。OCR阈值仅对当前账号界面复核标记生效，后台判定不变。协作事项明确未接入，不展示假数据。生成参数和Skill管理继续后续开发。

检查：类型、构建、个人上下文/文档隔离与幂等/冲突/期限保留、原生DSH与HTTP集成；不调用真实模型、不做浏览器验证。发布前在线恢复点并校验；保留旧发布与备份。网页/手机/真实模型由用户验收。

## 本地交付检查

- 新增usePersonalContext统一载入/保存/幂等与错误反馈；GlassSegments保持单选中片，compact复用70%形变参数；ResponsiveDialog增加可替换标题区，无须另造模态。
- 文档存储不加表、不迁移；永久生效规则合并保留修订，限期/候选规则不改，保存冲突不覆盖；空文档停用原永久规则，留历史。
- lint/build、7项个人库/来源/偏好检查、2项原生DSH检查、1项完整双教师HTTP/DSH模拟模型集成通过。HTTP覆盖文档401、来源403、跨用户隔离、幂等及冲突。无真实模型或浏览器调用。构建保留既有chunk大小提示。
- GitHub推送、PR合并、母文件夹同步与服务器备份部署已获本轮用户明确授权；发布结果随后追加。

## 生产发布 / 2026-10-28

- PR #95：https://github.com/CXC0515/qingsong/pull/95；合并提交c3e9297b7b629a1dc6413402e6d3776be06e5b23。母文件夹main同步后git archive打包，SHA256 cc41d77cad3ce745604857406fd1336f0b94a6fcebaa72cb6fde25b07f5f216f，服务器回读一致。母文件夹已有未跟踪资料/数据保留。
- 新release复用原锁文件完全相同的根/agent依赖副本，在服务器Node24.22.1下完成类型、生产构建、JS语法、7项个人库/来源/偏好、2项原生和1项完整HTTP/DSH检查，全部通过。临时库、模拟模型，无真实供应商调用。
- qs-settings-build-c3e9297及qs-settings-switch-c3e9297独立systemd任务均成功，ExecMainStatus=0，分别有BUILD_VERIFIED、DEPLOY_VERIFIED标记。构建时旧服务持续运行。
- 切换前后台queued/running/processing任务计数为0。停写后在线恢复点 /var/lib/teacher-dashboard/backups/manual/product-2026-10-28-pre-settings-v2-c3e9297 创建并独立验证：1317文件、8SQLite。未清理旧备份或发布。
- 原子切换current至新完整SHA目录。服务active/running、MainPID1807624、NRestarts0；自动备份timer恢复active。启动轮询有短暂连接拒绝，随后live/ready均成功。8库完整性ok、外键错误0，切换前后schema和表计数完全一致；未做数据迁移或恢复，不宣称已比较全量数据内容哈希。
- 原发布db56430dfbc99dba8efc83a2f065a3b017177b8c保留，可恢复旧代码；不覆盖当前生产数据。公网资源及权限另核对，健康不代表网页或真实模型验收。
- 本次未修复会话发送反馈/历史加载性能专项；该调查仍见ASSISTANT_CHAT_LATENCY_REVIEW.md。协作事项、管理员生成参数、Skill管理仍为后续目标，正式UI明确能力边界。

公网最终核对：live/ready均200；未登录personal-context、instructions和official均401。公网完整资源SHA256与服务器dist一致：

- `/assets/index-DsySHyds.js`：`765f2bb401dd4779eef13269cf4b322838906f77e8797653685d160256ed5640`。
- `/assets/index-_UQIAYlx.css`：`19f6458f6acd82356ae4beba3b4e4db0d40537c48af6c1d6d0470dcdb3f6391c`。
