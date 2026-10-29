# 青松教师 海外生产运维手册

> 文档版本：`v2.0`
> 日期：2026-09-16
> 当前入口：`https://td.unreached.top`

## 1. 边界与目录

本手册只适用于腾讯云硅谷实例上的 青松教师。上海实例预留给 Hermes，不是 青松教师 的回滚源或数据源。旧 MacBook + Cloudflare Tunnel 部署已退出当前架构，历史记录仅通过 Git 追溯。

```text
/opt/teacher-dashboard/current
/etc/teacher-dashboard/teacher-dashboard.env
/var/lib/teacher-dashboard/product-2026-09-16-r2
/var/lib/teacher-dashboard/backups/automatic
```

- systemd 服务：`teacher-dashboard.service`
- 自动备份：`teacher-dashboard-backup.timer`
- Nginx 站点：`td.unreached.top`
- 应用监听：`127.0.0.1:4317`
- 环境变量文件必须为 `root:root`、权限 `600`；不得输出或提交密钥。

## 2. 日常只读检查

```bash
sudo systemctl status teacher-dashboard --no-pager
sudo systemctl status teacher-dashboard-backup.timer --no-pager
sudo journalctl -u teacher-dashboard -n 100 --no-pager
sudo nginx -t
curl -fsS http://127.0.0.1:4317/api/health/live
curl -fsS http://127.0.0.1:4317/api/health/ready
df -h / /var/lib/teacher-dashboard
free -h
```

公网检查：

```bash
curl -fsS https://td.unreached.top/api/health/live
curl -fsS https://td.unreached.top/api/health/ready
curl -sSI https://td.unreached.top/
```

`live` 证明进程可响应；`ready` 同时检查存储和外部能力配置。配置状态不是一次真实 OCR/AI 调用成功的证据。

## 3. 发布新版本

正式服务只能发布已验收并合入 `origin/main` 的提交：

1. 在 `/opt/teacher-dashboard/releases/<commit>` 创建新发布目录。
2. 先按 `.node-version` 安装/选用项目运行时（Linux安装器：`sudo bash ops/linux/install-node-runtime.sh`），把对应 `bin` 放到 PATH 首位。当前固定Node24.22.1；应用、DSH和备份使用同版。新发布分别执行根目录与agent的 `npm ci --no-audit --no-fund`、类型检查、构建和与风险相称的测试。不要复用旧Node的原生模块；详见 [Node统一](NODE24_UNIFICATION.md)。
3. 确认数据结构变更及恢复点；需要迁移时先按 [WEB_DATA_MIGRATION_RUNBOOK.md](./WEB_DATA_MIGRATION_RUNBOOK.md) 创建在线产品快照。
4. 原子更新 `/opt/teacher-dashboard/current` 符号链接。
5. `sudo systemctl restart teacher-dashboard`，检查日志、回环健康和公网健康。
6. 验收前保留上一发布目录，不删除当前数据目录。

不得从临时 Codex worktree 长期运行生产服务。

## 4. 服务操作

```bash
sudo systemctl restart teacher-dashboard
sudo systemctl stop teacher-dashboard
sudo systemctl start teacher-dashboard
sudo systemctl enable --now teacher-dashboard
sudo systemctl enable --now teacher-dashboard-backup.timer
sudo systemctl start teacher-dashboard-backup.service
```

重启前先确认没有正在提交的长任务。应用启动会把遗留的进行中任务标记为中断，由用户重试；不会把半完成结果标为成功。

## 5. 备份与恢复

自动任务每天 03:15 检查数据；无变化时跳过，有变化时生成并验证快照，仅保留最近两份成功的自动快照。升级前手工恢复点不参与自动清理。

手工备份：

```bash
sudo systemctl start teacher-dashboard-backup.service
sudo journalctl -u teacher-dashboard-backup.service -n 100 --no-pager
```

恢复必须停止写入并落入全新目录：

```bash
sudo systemctl stop teacher-dashboard
cd /opt/teacher-dashboard/current
sudo -u teacher-dashboard /opt/teacher-dashboard/runtimes/node-v24.22.1-linux-x64/bin/node --import tsx server/scripts/verifyProductData.ts <snapshot>
sudo -u teacher-dashboard /opt/teacher-dashboard/runtimes/node-v24.22.1-linux-x64/bin/node --import tsx server/scripts/restoreProductData.ts <snapshot> <new-target>
```

随后把环境文件中的 `APP_DATA_ROOT` 指向新目录，启动服务并验收。禁止把快照覆盖到原目录，禁止普通复制在线 SQLite。

## 6. Nginx、证书与 DNS

- 阿里云 DNS：`td.unreached.top` 的 A 记录指向 `43.172.77.153`。
- 腾讯云实例防火墙与 UFW 均需放行 80/443；2026-09-16 曾因云防火墙缺少 443 导致公网 TLS 握手无法到达 Nginx。
- Nginx 只代理到 `127.0.0.1:4317`，上传限制为 82 MiB，请求读取/发送超时为 600 秒。
- Let's Encrypt 证书由 Certbot 管理；当前证书到期日为 2026-12-15。续期检查：

```bash
sudo certbot renew --dry-run
systemctl list-timers --all | grep certbot
```

证书或 Nginx 变更前先运行 `sudo nginx -t`。域名故障时先区分权威 DNS、公共递归解析、证书和应用回环健康，不用重启应用掩盖 DNS 问题。

## 7. 故障处理

### 应用 502/不可达

1. 查 `systemctl status` 和 `journalctl`；
2. 查回环 `live/ready`；
3. 查 4317 是否只监听回环；
4. 查 Nginx 配置和日志；
5. 只有确认根因后才重启。

### 磁盘或内存告警

- 先查上传、快照、日志和发布目录各自占用；不得直接删除未知目录。
- 2 GB 实例依赖交换空间吸收短时峰值，交换空间不是长期内存容量。
- 删除历史手工恢复点、数据目录或旧发布目录前，必须列出精确目标、可恢复性并取得批准。

### AI/OCR 异常

区分密钥/配置、请求格式、供应商排队、限流、超时和模型输出问题。`ready` 只验证配置存在；供应商真实调用失败时保留原始证据、任务状态和人工重试入口。

## 8. 安全边界

- 公网只开放 80/443；SSH 使用独立公钥，禁止把私钥放入仓库或聊天。
- 登录、API 和上传文件保持同源；未登录业务接口应返回 401。
- 生产密钥只存于服务器环境文件，不写入 systemd unit、Nginx 配置或文档。
- 服务器下线、数据跨境策略变化或新用户扩大前，重新评估备份、合规与容量。

## 9. 修改历史

| 版本 | 日期 | 状态 | 修改概要 |
| --- | --- | --- | --- |
| v1.x | 2026-09-08 至 2026-09-12 | 已归档 | MacBook、Cloudflare Tunnel 和备案期间本地运行方案。 |
| v2.0 | 2026-09-16 | 当前 | 改为腾讯云硅谷、Nginx、systemd、Let's Encrypt 和服务器产品快照运维。 |

## 教学助手运行与发布补充（2026-10-27）

助手由原应用管理DSH子进程，不新增常驻系统服务。必须同时安装agent依赖，并保留Nginx的HTTP/1.1及WebSocket升级头。聊天SSE使用X-Accel-Buffering: no；模型管理的专用升级路径是/api/assistant/manage/api/remote.mux，应用层检查登录、owner与同源。

发布前除现有批改/材料/资料任务外，也要检查各工作区assistant会话JSON中的queued/running状态，避免中断正在使用的对话。手工产品快照应在停写后创建并校验；它包含system下DSH配置/凭据及工作区会话，不得把其中的文件、模型密钥或管理启动凭据输出到日志或聊天。恢复或回滚需明确授权，保留旧发布，不以恢复数据库代替代码切换。真实模型验证由用户在已登录助手中进行；代理fixture通过不代表供应商连通或回答质量已验收。

## 发布目录保留规则（2026-10-28，用户已确认）

- releases在验收后只保留当前运行版和一个明确可回滚的上一版；新候选刚上线、尚未验收时，允许临时额外保留原稳定版，验收后收敛回两版。不要为每次代码迭代永久复制一套依赖。
- 删除前列明确完整目录清单，核对current与回滚目标、Git main可恢复性、目标没有生产数据库/上传资料，采用完整白名单路径；不使用前缀通配或删除未知目录。当前版本改变时停止清理。
- 更老代码由Git与锁文件重新构建；生产数据在/var/lib/teacher-dashboard下，备份独立按恢复原则管理。不得把本规则应用到手工恢复点或用户数据。
- 2026-10-28已按单独确认清理23个旧发布，释放约19.9GB；完整记录见ASSISTANT_CONNECTION_RECOVERY.md和服务器审计文件。后续清理继续记录实际删除、保留目标和健康结果。


## 2026-10-29 材料/管理员参数整合发布补充

- 应用PR #101，生产75cd981；完整证据以PROJECT_HANDOFF.md当前记录为准。当前生产实际9个SQLite，旧手工恢复点为1317文件/8库。不能继续把历史8库数量写死为现库校验条件；先核对原库无缺失，再以停写时实际集合比较完整性、外键、schema和计数。
- 助手Office读取使用独立 `/opt/teacher-dashboard/runtimes/assistant-office-py-v1/bin/python`，python-docx1.2.0/python-pptx1.0.2；由环境变量QS_ASSISTANT_PYTHON指定。PADDLEOCR_PYTHON不随本次改变。新服务器应先准备相应解释器/库并验证Kit/WASM、字体；不依赖Codex本机目录。
- 配置回切记录仅含QS_ASSISTANT_PYTHON此前的非秘密值，存于root受限运维目录；不复制或打印完整环境文件和凭据。代码回切不等于恢复数据库，也不保证撤回新版本运行后用户产生的新数据。
- 本次未改Nginx，未新增数据备份，未清理release；新75cd981和原三份release暂存，后续删除需另列清单获批。正式站网页及真实模型效果仍由用户验收。
