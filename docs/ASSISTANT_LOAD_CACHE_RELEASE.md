# 助手载入缓存修复与会话清空

- 版本：v0.2
- 日期：2026-10-30
- 状态：PR #111已合并并部署ed4c78f；全账号19个会话已清空，网页速度待用户验收。
- 原始问题：用户进入助手等待超过30秒；已观察到5.46MB脚本压缩后约1.19MB重复下载，助手启动约5.3秒不能解释全部等待。
- 部件：页面资源代理与缓存，不改记忆召回。DSH版本化插件URL已带12位rev并拒绝错版，当前私有max-age=0导致重校验。
- 最短修改：server/services/assistant/officialResponses.ts识别带合法rev的JS/CSS为私有immutable；未版本化插件仍重校验，HTML/API/SSE不缓存。officialAssistant.ts传入查询串，统一由代理计算ETag避免上游条件响应与本地ETag冲突，合并Vary不覆盖Cookie。对应2份测试验证缓存、304空体和匿名拒绝。
- 风险：首次下载仍需传输，新版本仍冷加载；不承诺仅凭服务端检查就证明用户网络首屏速度。鉴权不放开，不修改插件SDK、页面布局、业务数据和记忆。
- 会话删除：盘点所有生产assistant目录，停写并在线产品备份后，仅清空原生sessions及session_projcache派生索引；其他旧版会话如发现则同样精确列入。个人规则、长期记忆、学生/班级/资料、模型配置及原生workspace目录保留。删除后核对全账号会话数为0、非会话文件和数据库一致，再启动与核验。备份保留可恢复副本，不代表不可恢复擦除。
- 发布：本机类型、构建及相关测试；PR合并；母文件夹main打包；Linux候选检查；保留原发布回滚；部署后公网资源与服务检查。网页体验由用户验收。

## 修改历史
- v0.1：记录批准范围及精确数据删除边界，待追加真实结果。

## 实际发布与删除结果
- PR #111合并为ed4c78f34d3b30cbf2b76c0c9e2c75a47a0127be；母文件夹main同步打包，SHA256 7ad200e10370a33a3f1c8df4fe3fb9e032403371c28be78024b11d21a04bdb1e。
- 本机及Linux类型、构建、2项缓存单测和3项HTTP/DSH集成通过；版本化插件private immutable、ETag→304空体、Cookie隔离和匿名401有回归覆盖。HTML/API/SSE仍不缓存。
- 部署前生产原生活动轮0、业务处理任务0。在线恢复点 /var/lib/teacher-dashboard/backups/manual/product-2026-10-30-pre-session-reset-ed4c78f，共1369文件/9SQLite，已完整校验。
- 所有生产目录扫描得到两个原生助手范围，共19会话与19派生投影；未发现其他旧版conversations/sessions/messages JSON会话库。停止应用后清空两个sessions根和两个session_projcache根，共4个根目录。
- 清空前后9库全部表行哈希、1286份非会话文件一致，重启后会话仍为0。个人记忆、规则、教学业务、模型配置和workspace保留；备份中仍有可恢复会话副本。
- current已切换ed4c78f，保留a7806c9回滚。应用与Qdrant active/running、NRestarts0，备份timer恢复。切换期间并行公网探测曾读到短暂502，须以切换完成后的复核为准。
- 服务器证据 /tmp/qs-cache-linux-tests.log、/tmp/qs-cache-cutover.log；删除目标及非会话哈希在 /var/log/teacher-dashboard-cache-session-reset/。失败恢复脚本只恢复指定会话根，不覆盖业务数据。
- 本修复减少同一版本资源重复下载，首次下载/换版本仍可能慢；没有完成用户真实网络首屏耗时验收，不宣称已达到某个秒数。
- v0.2：记录实际合并、部署、19会话清空、恢复点和数据保持核验。
