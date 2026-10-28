# 助手附件与材料池引用

版本：1.1 · 2026-10-29 · 状态：本机实现与代码review完成，检查通过；按用户首轮反馈修正选择器，未部署，待继续验收。

## 本次概要与授权

教师需要把常见教学文件交给助手，并明确引用材料池已有资料。用户批准代码和本文档范围，要求使用新worktree、Git提交、本机预览，网页与手机自行验收；不调用真实模型，不单项立即部署。管理员生成参数是独立后续专项。本批不含push、PR、合并、部署授权。

新worktree `/Users/cxc/.codex/worktrees/assistant-materials/qingsong`，分支 `codex/assistant-materials`，最新基线 `origin/main@d09f61d`。旧assistant-settings专项 `codex/connection-release-record@3cec778` 经核对PR #100已合并且无新变化，依赖移入新目录后移除旧worktree和该已合并本地分支。其他会话目录及母文件夹原3项未跟踪内容保留。

## 事实、决策和边界

- 既有DSH 0.2.1-rc.3有原生附件存储、上传凭证、卡片、图片历史、Office Skill与LibreOffice Kit；完整桌面运行环境不等于青松Web部署。保留当前版本，只直接声明已锁定Kit 0.1.5依赖。
- 原生通用文件通过只读路径供工具读取；原生read只读UTF-8；Office预览并不自动提供模型输入。fs-local/fs-sandbox不提供所需的附件读取围栏，不能直接恢复通用文件或Shell。
- 复用原生上传/卡片/历史/输入引用chip、Kit、官方Skill对应的库和读取方法；青松用固定读取程序适配成qingsong_material工具，模型不能提供脚本或服务器路径。
- 当前会话的真实用户附件、教师明确选入的材料池资料可读；其他聊天附件不检索、不引用。学生主体、业务写入、个人规则授权均不因资料内容而改变。
- 首版只读和分析，原件不改，聊天附件不自动加入材料池；不新建原型、不重新设计已确认界面。

## 交互与反馈

原生命令加号继续隐藏，在同一输入操作区通过官方slot提供附件菜单：上传文件/从材料池选择。原生createDrafts处理文件选择、粘贴、拖放；未发送附件卡保留原生重试/移除行为。

材料池弹层复用ResponsiveDialog、GlassButton与已有列表/文件夹/搜索/分页接口，最多20项，换筛选保留选择，可移除。引用内部记录资料ID、内容哈希、名称和会话，先暂存，实际用户消息含引用标记才激活；取消不授权。名称只用于展示，不能成为路径。幂等键绑定选择集合；改集合后换键，同集合未知结果后可重试。

父子窗口仅接受同源、准确iframe/parent来源，以及匹配的session/request/connection ID。草稿改变后用DSH revision检查防覆盖，失败保留输入并提示重新选择。重连/取消/卸载清理未完成请求。

原件/引用失效、回收、权限撤回或内容改变时不返回旧缓存；错误说明原件和对话是否保留、下一步如何处理。read的coverage、来源与警告描述实际范围，上传成功不代表全部内容已读。

## 读取与渲染

| 类型 | 复用与输出 |
|---|---|
| UTF-8文本 | 有界行读取、行号及截断标记；不限TXT扩展名 |
| PDF | PDF.js文字层按页提取；空文字层明确未执行OCR，可render供视觉模型看页 |
| DOCX | 固定Python worker复用python-docx，正文及表格 |
| PPTX | 固定Python worker复用python-pptx，逐页文字/表格/备注/图表相关内容 |
| XLSX | 既有ExcelJS读取工作表/区域/公式及缓存值；统计sum/average/min/max/count等有限数值汇总，不执行宏、不自动重算公式 |
| DOC/PPT/XLS | Kit转换PDF后按页读取或渲染；明确转换页码不代表原始结构，旧XLS不提供结构化统计 |
| 页面/区域 | Kit renderImages，PDF/Office按页、Excel按sheet+range；DSH持久图像块送入支持图片的模型 |
| 图片 | DSH原生规范化与模型输入；资料池图片走同一图像返回合同 |

文本/结构读取不依赖视觉模型；本轮新图片与页面渲染检查实际模型能力声明，声明不等于真实供应商已验证。没有原生引擎、Python库或相应能力时中文明确失败，不虚报成功。

Word/PPT所需Python通过 `QS_ASSISTANT_PYTHON`，或现有 `PADDLEOCR_PYTHON/python3`选择；正式代码不绑定Codex本机运行目录。生产解释器、库、Linux Kit/WASM、字体与资源预算须发布前单独核实。

当前没有新增外部OCR调用，也没有把资料池未解析原件当作已有OCR结果。扫描页可先视觉读取；已有OCR结果复用与按需OCR仍需按真实来源映射继续接入，不宣称本批已完成OCR闭环。

## 存储与资源

不改业务schema。引用记录存每用户原生home下 `qingsong-materials/sessions`，使用会话哈希文件名、私有权限、原子替换与串行更新；坏文件不当作空记录。最多500引用/会话、1000个选择请求，原件不自动清理。

缓存按用户home、解析器版本、文件哈希、类型及读取参数隔离；读取前重新鉴权、核对来源与哈希，缓存不绕过权限。派生图像不泄露宿主路径。原始上传不做跨用户全局去重。

复用材料池单文件80MB限制；新图片每张10MiB、每条最多5张/总20MiB，原生显示限额与服务端一致。JSON仅放宽已鉴权的native prompt/updateQueue到30MB，其他API和WS仍原上限。通用上传保留有界背压与取消，每用户有界排队；上传、内联图与工具生成图共用512MiB持久存储预留，计入派生缓存，不自动删除真实附件。该值不包含转换期间的原件临时副本、引擎内存及全部瞬时磁盘峰值；转换单并发与大小限制单独约束这些资源。成功后删除本次转换原件副本，只保留派生图片。

读取输出最多40000字符、Excel区域最多5000格；ZIP展开128MiB/10000项，页面渲染最多3页/图片合计10MiB。Kit转换单进程最多1项，固定程序有取消和超时。限额是当前小实例的防护值，不是性能承诺。

## 验证与验收

分项：真实合成文本/PDF/现代Office与图片读取；官方Kit公开旧格式样本转换；内容哈希/符号链/损坏/取消/截断；Excel公式缺缓存及数值统计；引用幂等、激活、跨会话/跨教师拒绝、回收后缓存拒绝；并发存储预留；原生UI消息与草稿revision合同。

集成：真实HTTP/DSH原生进程＋本机模拟供应商，上传→凭证→消息→材料工具→模型输入，实例重启后同会话续读；材料池上传与引用；图片历史归属；既有教学查询、规则记忆及SSE/撤权回归。

用户承担网页、手机、触控、真实材料与真实模型理解验收；代理不调用浏览器，不消耗真实模型/OCR额度。构建、协议和样本检查通过不能称网页已验收或生产已支持。

### 本机检查结果

- Node24.22.1：类型检查、生产构建、Git空白检查通过。构建仍有既有大chunk提示，未为消除提示扩大重构。
- 8项文件读取/渲染检查通过，无跳过；覆盖文本/Markdown、PDF文字层、真实合成DOCX/PPTX、Excel公式缓存与统计、图片、Kit真实PNG页面输出。Kit官方公开旧DOC/PPT/XLS样本的读取/渲染也通过，临时样本已移除。
- 9项原生材料合同＋4项原生运行/原有UI合同，共13项通过；检查真实引用chip、同源与会话/连接关联、草稿revision、新图片能力门禁、历史分批恢复及原prompt不变。
- 15项服务端定向/回归通过，包含3项材料授权、2项配额，以及既有个人上下文、SSE与响应合同。
- 1项完整双教师HTTP/DSH集成通过：实际原生二进制上传、上传凭证、工具读取、实例重启续读、材料池引用、图片历史读取及跨账号/跨会话拒绝；供应商为本机模拟。
- Review已修复：实际附件ID的sha256前缀、配额多入口一致性、冷启动取消、多选上传排队、选择变更重试幂等键、缓存版本/格式及同键串行、私有路径泄露、长历史批次、个别不可用材料隔离。
- 原始本机日志：`/tmp/qingsong-materials-reader-final.log`、`/tmp/qingsong-materials-regression.log`、`/tmp/qingsong-materials-native-check.log`、`/tmp/qingsong-materials-http-check.log`、`/tmp/qingsong-materials-build.log`。

### 用户本机验收入口

- Web `http://localhost:4480/`，API `127.0.0.1:4475`；使用当前worktree源码与独立临时数据，不连接正式数据。
- 合成账号 `preview@fixture.test`，密码 `Fixture-password-12345`（仅本机公开样本凭据）。材料池预置TXT、XLSX、两页PDF；也可自行上传合成Word/PPT/图片。
- 模型是确定性本机fixture，能够回显材料工具结果，不能代表真实模型理解、按意图选工具或复杂推理质量。测试页面/手机流程由用户完成，未作代理浏览器验收。
- API复现：在Node24.22.1下设置 `QS_ASSISTANT_PYTHON` 为含docx/pptx的本机解释器，执行 `QS_NATIVE_PREVIEW=1 QS_TEST_PORT=4475 QS_PREVIEW_ORIGIN=http://localhost:4480 node --import tsx --test server/services/assistant/officialAssistant.test.ts`；Web执行 `API_PROXY_TARGET=http://127.0.0.1:4475 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4480 --strictPort`。端口占用时先确认归属，不覆盖其他专项进程。

## 修改历史

- v1.0：记录获批范围、复用方法、引用权限、读取合同、本机验证及发布前限制。
- v1.1：用户批准本机修正：共享ResponsiveDialog增加可选peak 30% / half 60% / full 80%三态，默认half，拖动把手/键盘切档，适配visualViewport变化；仅材料选择启用，移除compactFull。文件夹筛选复用GlassButton/ResponsiveChoiceDialog，固定箭头位置；去掉重复已选/移除区，列表点击切换、底部数量及跨筛选保留选择。等待用户选择不计时，仅10秒打开握手与30秒实际提交计时；跨窗口打开/取消同步、旧回执隔离，错误支持关闭。13项原生/桥接检查、类型与构建通过，未做网页或手机验收。
