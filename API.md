# dsh-workspace-vault — 接口契约（Host ⟷ Client）

本文件是 `dsh-workspace-vault` 插件宿主半边（`lib/index.js`）与浏览器半边（`lib/client.js`）之间**唯一的契约**。
两面由不同作者并行实现，任何一面都不得擅自更改这里的路径、字段名或语义；需要变更时先改本文件并通知 Lead。

## 1. 定位

在 DSH 桌面端（desktop profile）侧栏「工作区」区域上增加：

1. **工作区置顶**（pin workspace）——任意工作区可置顶到「工作区」列表最前，置顶顺序持久化在宿主。
2. **任务置顶**（pin session/task）——从会话页头把当前任务置顶到它所属工作区顶部；置顶本身复用 DSH 原生
   `workspaces.pinSession` / `unpinSession` 与原生「已置顶」指示器（导航行为由原生侧栏负责）。
3. **隐藏空间**（hidden space）——「工作区」区头右侧一个独立图标；设置密码后进入；隐藏空间里的工作区与普通
   工作区行为一致（仍是原生工作区），但**不参与云同步**、数据只留在本机。
4. **工作区加密**（workspace lock）——与隐藏空间共用同一个主密码；加密后的工作区在解锁前不显示其会话内容。

## 2. 数据与路径

- DSH home：`process.env.DSH_HOME`（可为 `~` 展开）或 `~/.dsh`。
- 状态文件：`<DSH_HOME>/workspace-vault/state.json`（原子写：临时文件 + rename；解析失败时备份坏文件为
  `state.json.broken-<ts>` 并回退为空状态，绝不静默丢配置）。
- 隐藏空间工作区根目录：`<DSH_HOME>/hidden-space`（仅在创建隐藏工作区时按需 mkdir）。

状态文件 schema（缺失的字段一律按默认值补齐；未知字段保留）：

```json
{
  "version": 1,
  "password": {
    "algorithm": "scrypt",
    "salt": "<32 hex chars>",
    "hash": "<128 hex chars>",
    "N": 16384,
    "r": 8,
    "p": 1,
    "keylen": 64
  },
  "phone": { "hash": "<sha256 hex of normalized digits>", "masked": "138****8000" },
  "hiddenWorkspaceIds": ["<workspaceId>"],
  "encryptedWorkspaceIds": ["<workspaceId>"],
  "pinnedWorkspaceIds": ["<workspaceId>"]
}
```

- `password: null` 表示尚未设置主密码；`phone: null` 表示未绑定手机号（无法找回）。
- 密码用 Node `crypto.scryptSync`（参数如上）+ 随机盐，`timingSafeEqual` 比较；**任何情况下不落明文密码**。
- 手机号规范化：仅保留数字；要求 6–20 位。`masked` 规则：长度 ≥ 7 时 `前3 + "****" + 后4`，否则 `"****"`。
- `hiddenWorkspaceIds` 与 `encryptedWorkspaceIds` 为去重集合（保序）；`pinnedWorkspaceIds` 为 **最近置顶在前** 的数组。
- 隐藏空间与加密工作区都从云同步中排除（由 `dsh-workspace-sync` 读取本状态文件实现）。

## 3. 解锁令牌

- 宿主进程内内存令牌表：`Map<token, expiresAt>`，token 为 `randomUUID()`，有效期 **30 分钟**（固定，不滑动）。
- 宿主重启即全部失效；客户端也只在内存中保存 token（不写 localStorage），刷新页面即重新上锁。
- 需要令牌的接口统一字段 `token`；无效/过期返回 `{ ok:false, code:"token-invalid" }`。

## 4. HTTP 路由（Host 侧注册到 `ctx.webServer.register`）

全部为**精确匹配**；仅绑定本机回环（沿用 DSH webServer 的认证）。业务失败也返回 HTTP 200 + `{ ok:false }`；
请求体不是合法 JSON 返回 HTTP 400；方法不符返回 405。

| 方法 | 路径 | 请求体 | 成功响应 |
| --- | --- | --- | --- |
| GET | `/api/workspace-vault/state` | — | `{ ok:true, version, hasPassword, phone: { masked } \| null, hiddenWorkspaceIds, encryptedWorkspaceIds, pinnedWorkspaceIds, hiddenRoot }` |
| POST | `/api/workspace-vault/password` | `{ action:"setup", password, phone? }` / `{ action:"change", currentPassword, password }` / `{ action:"recover", phone, password }` | `{ ok:true, hasPassword:true, phone: { masked } \| null }` |
| POST | `/api/workspace-vault/unlock` | `{ password }` | `{ ok:true, token, expiresAt }` |
| POST | `/api/workspace-vault/check-token` | `{ token }` | `{ ok:true }` |
| POST | `/api/workspace-vault/pin-workspace` | `{ workspaceId, pinned }` | `{ ok:true, pinnedWorkspaceIds, order }` |
| POST | `/api/workspace-vault/hidden` | `{ token, workspaceId, hidden }` | `{ ok:true, hiddenWorkspaceIds }` |
| POST | `/api/workspace-vault/encrypt` | `{ token, workspaceId, encrypted }` | `{ ok:true, encryptedWorkspaceIds }` |
| POST | `/api/workspace-vault/create-hidden` | `{ token, name, baseDir? }` | `{ ok:true, path, name }` |

### 错误码（`{ ok:false, code, message }`）

- `bad-request` 参数不合法；`invalid-password` 密码不满足规则（4–128 字符）；`already-configured` 已设过密码；
- `bad-password` 密码错误（错误提示必须模糊，不区分「没设置」以外的细节）；`no-phone` 未绑定手机号；
- `bad-phone` 手机号与绑定的不一致（找回时）；`token-invalid` 令牌无效/过期；
- `unknown-workspace` workspaceId 不在注册表；`name-taken` / `invalid-name`（创建隐藏工作区）；
- `io-error` 文件系统/注册表操作失败（message 可读即可）。

### 行为细节

- `setup`：已有密码 → `already-configured`。`change`：校验 currentPassword。`recover`：校验 phone 的
  sha256 与存储一致（不做短信，见「已知限制」），然后替换密码（salt/hash 全部重生成，旧令牌全部失效）。
- `unlock`：无密码 → `bad-password`（客户端应先走 setup）；成功后发新 token。
- `pin-workspace`：校验工作区存在；更新 `pinnedWorkspaceIds`（置顶时插到数组头；取消时移除），
  再按 `[pinned..., 其余保持注册表当前相对顺序]` 调 `ctx.workspaceRegistry.insertBefore(id, beforeId)`
  重排宿主列表（返回值 `order` 为最终顺序的 workspaceId 数组）。取消置顶的工作区放到「非置顶区」最前。
  `insertBefore` 调用要逐步应用（每一步后重新读取注册表顺序），对已删除/缺失的 id 容错跳过。
  额外支持 `{ reapply: true }`（无 workspaceId/pinned）：不改成员，仅按已保存的 pinned 顺序重排并返回
  `{ ok:true, pinnedWorkspaceIds, order }`；客户端在侧栏顺序与 pinned 前缀不一致时调用（重启/刷新后自愈）。
- 宿主 `apply()` 时也要（延迟重试直到注册表可用）应用一次 `pinnedWorkspaceIds` 顺序，让重启后置顶仍生效。
- `hidden` / `encrypt` / `create-hidden`：需有效 token。`hidden`/`encrypt` 只记录标记，不删除数据。
- `create-hidden`：按 `workspace-plus` 的命名规则校验名称（不能包含 `<>:"/\|?*`、不能以点结尾、不能是
  Windows 保留名、≤80 字符）；目录已存在则复用（内容不覆盖）；返回**绝对规范路径**。`baseDir` 允许客户端
  传入绝对路径（一般不用），默认 `<DSH_HOME>/hidden-space`。

## 5. 客户端（`lib/client.js`）职责与 DOM 契约

- 必需服务：`slots`、`locale`；可选/防御式获取：`workspaces`、`sessions`、`uiWorkspace`。
- 启动时 `GET state` 载入；所有写操作后按响应更新内存集合并重新执行一次装饰/过滤。
- **不改写原生组件，不占用 `sidebar.workspaces` 单槽**；用 `shell.overlay`（对话框）+
  `conversation.session.header.actions`（任务置顶按钮）+ 侧栏 DOM 装饰。

### DOM 选择器（依赖 DSH 0.2.1-rc.5 的稳定 data 属性 / class 片段）

- 侧栏根：`[data-slot="sidebar"]`（缺失时退回 `document.body`）。
- 区头：`[class*="sectionHeader"]`；区头动作容器：`[class*="headerActions"]`。
- 工作区行：`[data-row-key^="workspace:"]`（key 即 `workspaceId`；`workspace:` 后为空的是「未分组」）。
- 会话行：`[data-row-key^="session:"]`（key 即 sessionId）。
- 「展开其余」行：`[data-row-key^="overflow:"]`（key 即 workspaceId）。
- 行内按钮容器：行内 `[class*="rowActions"]`。

### 注入元素（统一属性 `data-dsh-workspace-vault`）

| 值 | 位置 | 说明 |
| --- | --- | --- |
| `hidden-space-toggle` | headerActions 首个子元素 | 隐藏空间/退出隐藏空间图标按钮 |
| `hidden-banner` | 区头之前（同一父容器） | 隐藏模式横幅：已解锁 + 新建隐藏工作区 + 退出 |
| `pin` | 工作区行 rowActions 首位 | 置顶/取消置顶按钮（hover 显示） |
| `pin-badge` | 工作区行 rowActions 之前 | 已置顶小徽标（常显） |
| `lock` | 工作区行 rowActions | 加密/解锁按钮（hover 显示） |
| `lock-badge` | 工作区行 rowActions 之前 | 已加密小徽标（常显） |

- 隐藏的 DOM 行：加类 `dsh-workspace-vault-hidden`（插件样式表里 `display:none !important`）。
- 所有注入用 `ensure()` 幂等补回（React 重渲染可能移除），用 `MutationObserver`（`childList+subtree`）
  节流（rAF 或 50ms 防抖）后统一重跑；`apply()` 的 `ctx.effect` 清理时断开 observer、移除注入元素与样式。
- 全部装饰逻辑包 try/catch；**插件 apply 抛错不得影响客户端启动**。

### 可见性规则

定义：`hidden = state.hiddenWorkspaceIds`，`encrypted = state.encryptedWorkspaceIds`，
`unlocked = 本页面已解锁的 workspaceId 集合`，`hiddenMode = 已在隐藏空间内`。

- 工作区行可见性：`hiddenMode ? (id ∈ hidden) : (id ∉ hidden)`；未分组行在 `hiddenMode` 时隐藏。
- 会话/overflow 行：解析所属 workspaceId（会话通过 `workspaces.list` 各工作区的 `sessionIds` 反查），
  可见性同其工作区；另外若所属工作区 ∈ encrypted 且未在 `unlocked` 中则隐藏。
- 点击「已加密且未解锁」的工作区行：捕获阶段拦截并打开解锁对话框（停止原生展开/收起）。
- 主内容区保护：当前会话属于「隐藏空间（未在隐藏模式）或已加密未解锁」时，用 `shell.overlay` 渲染全屏
  遮罩 + 解锁/离开入口，防止内容泄露。

### 隐藏模式交互

- 区头图标点击：`hasPassword=false` → 设置密码对话框；否则解锁对话框。解锁成功 → `hiddenMode=true`。
- 隐藏模式横幅：「新建隐藏工作区」「退出隐藏空间」；退出时若当前会话属于隐藏工作区，先
  `uiWorkspace.openWorkspace(第一个可见工作区)` 或打开一个可见会话再退出。
- 隐藏工作区创建：对话框输入名称 → `POST create-hidden` → `workspaces.create({ path })` →
  `POST hidden { workspaceId, hidden:true }` → 提示成功并退出隐藏模式再进入（或刷新列表）。
- 工作区行「移入/移出隐藏空间」入口放在 `lock` 之外的次级交互：与 `lock` 合并为一个行内菜单按钮
  （`data-dsh-workspace-vault="row-menu"`），菜单项：置顶/取消置顶、加密/解密、移入/移出隐藏空间。
  （若实现成本高，可先实现独立按钮，但不得与原生 `…` 菜单冲突。）

### 密码对话框（`shell.overlay`）

- 设置：新密码 + 确认 + 手机号（可空；空则提示「忘记密码将无法找回」）+ 说明（本地校验、不发送短信）。
- 解锁：密码 + 「忘记密码」入口 → 找回对话框（手机号 + 新密码 + 确认）。
- 解锁成功后 token 只存内存；页面刷新 = 重新上锁。
- 所有文案走 locale（`dsh-workspace-vault` 命名空间），禁止硬编码中文/英文到组件里。

## 6. 已知限制（必须在 README 中写明）

1. 手机号找回是**本地校验**（比对绑定的号码后允许重置），不发送短信；DSH 没有短信通道。
2. 加密是**访问锁**，不是磁盘静态加密：会话日志仍以 DSH 原生的明文格式存放；隐藏空间/加密工作区只是
   不参与云同步、在 UI 上隐藏。不要宣称数据已加密存储。
3. 隐藏空间不是安全边界（同机进程、DSH 原生接口仍可读取）；它防的是「界面上被看到」和「同步到云端」。
4. 置顶工作区依赖宿主 `workspaceRegistry` 顺序；DSH 升级换了注册表接口时需要适配。
5. 侧栏 DOM 选择器依赖 0.2.1-rc.5 的 `data-row-key` / class 片段；升级 DSH 后需重跑自检。
