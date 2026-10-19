# AbleSign · 科研通 Cloudflare Workers 真随机签到

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jiandwei/ablesign)

[👉 一键部署到 Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/jiandwei/ablesign)

将 [ablesciSign](https://github.com/jiandwei/ablesciSign) 的自动登录、签到、重试、多账号与消息通知移植到 **Cloudflare Workers + SQLite Durable Objects + Alarms**。

**提醒：本仓库是公开模板，但账号和密码必须通过 Cloudflare Worker Secrets 单独设置，绝不可提交到 GitHub。**

## 核心功能

- **真正随机**：每天北京时间 07:30:00～21:29:59 用 Web Crypto 安全随机数独立抽取一个目标秒数；不依赖每 15 分钟轮询确定时间。
- **持久化**：随机目标、已签到账号、失败次数由 SQLite Durable Object 保存。Worker 重启、重复调度也不会重新抽签。
- **保守重试**：每个账号每天最多 **3 次**（首次签到 + 最多 2 次重试），失败后在当日允许时间内随机安排补签。23:45 兜底也受同一次数上限约束；当天已签到或达到上限不再请求。
- **风控立即停止**：遇到 HTTP 403、429、验证码、登录拒绝等安全限制信号，**当天所有账号停止自动签到和重试**（包括手动点击“立即签到”）；次日重新生成计划。风控检测是保守启发式，可能将登录异常当成限制以避免频繁尝试。
- **Cookie 优先**：可配置 `ABLESCI_COOKIE`（单账号）或 `ABLESCI_COOKIES`（多账号 JSON 映射）作为 Worker Secrets。优先直接用 Cookie 请求签到接口，无需重复登录。
- **密码登录每天最多一次**：仅当签到接口明确返回 Cookie 已失效时才回退密码登录；无 Cookie 时也只登录一次。密码登录配额在请求发出前写入 Durable Object，重启后不会重复登录。Cookie 已失效且密码配额耗尽时不再请求。
- **多账号**：支持多行 `邮箱:密码`，也兼容原脚本的同一行逗号/分号分隔。
- **通知**：支持 PushPlus、Server酱、息知。
- **安全**：管理员 API 使用 Bearer Token；接口不输出明文账号、密码或站点 Cookie。

## 一键部署

1. 点击顶部 **Deploy to Cloudflare**，授权 GitHub / Cloudflare 并选择部署项目。
2. 按部署页面提示配置 **`ABLESCI_ACCOUNTS`**（每行一个 `邮箱:密码`）和 **`ADMIN_TOKEN`**（随机生成不少于 32 个字符的管理口令）。可选填 `PUSH_PLUS_TOKEN`、`SCKEY`、`XZKEY`。
3. 如果部署页面未提示输入 Secrets：部署完成后到 **Workers & Pages → 对应 Worker → Settings → Variables and Secrets → Add → Secret** 补齐；不要用明文 `vars`。
4. 完成部署后，每天北京时间 07:20 自动为当天抽取时间。若当天已经过了 07:20，可以在安全窗口内调用 `POST /init` 初始化当天任务。

> Cloudflare 的官方部署按钮会从本公开仓库创建一个自己的项目副本并部署到 Cloudflare；一键的是**代码/资源部署**，科研通账号/口令仍由用户自行安全授权配置。部署不代表已完成真实网站签到，需查看签到状态和通知确认。

### 本地命令行部署（备用）

```bash
npm install
npx wrangler login
npx wrangler secret put ABLESCI_ACCOUNTS
npx wrangler secret put ADMIN_TOKEN
# 可选：npx wrangler secret put PUSH_PLUS_TOKEN
npm run deploy
```

也可以复制 `.dev.vars.example` 为 `.dev.vars` 本地调试；此文件被 gitignore 排除。

## Cookie 优先模式（可选）

**请先在科研通注销此前贴到聊天或其他公开位置的旧会话，再获取新的 Cookie；切勿在 GitHub Issues、README、Cloudflare 明文变量、日志中公布真实 Cookie。** Cookie 属于账号登录凭据，直接复制浏览器请求中的 Cookie 可能很快失效。

在 Cloudflare → Workers & Pages → `ablesign` → **Settings → Variables and Secrets → Add → Secret** 添加以下其中一种：

- 单账号：名称 `ABLESCI_COOKIE`，值为该账号从自己浏览器获得的完整 **Cookie 请求头值**（只复制 `Cookie:` 后面的内容，不要复制其他 HTTP 头）。`ABLESCI_ACCOUNTS` 继续保留单账号邮箱与密码，用于明确失效时的唯一一次密码登录。
- 多账号：名称 `ABLESCI_COOKIES`，值为 JSON 对象（邮箱 → Cookie 字符串），每个邮箱要与 `ABLESCI_ACCOUNTS` 的账号对应，例如：

```json
{
  "first@example.com": "session=example1; another=value1",
  "second@example.com": "session=example2; another=value2"
}
```

上面是虚构数据，不可直接用于登录。不要同时对多账号配置单账号 `ABLESCI_COOKIE`。

**访问流程：**

1. 每天北京时间 07:30–21:29 随机抽签（原功能保留）。
2. 有可用 Cookie 时，优先请求 `GET https://www.ablesci.com/user/sign`；成功或已签到就结束。
3. 只有可明确识别的会话失效响应（如 HTTP 401、跳回登录页、返回“请先登录”等）才允许回退**一次**密码登录。
4. 403、429、验证码、访问频繁或其他明显风控信号直接停止当天所有自动请求，不尝试用密码绕过。
5. 每个账号每天最多 3 次签到尝试（包括首次加最多两次重试）；一天最多一次密码登录。前一次 Cookie 确认失效后，同日不再使用这份失效 Cookie。

Cookie 是否有效依赖科研通的会话策略与出口网络。浏览器能访问不代表 Cloudflare Worker 一定可以使用相同会话。响应中的 `content-encoding`、`server` 等不是客户端需要填写的请求头；Workers 会自动处理压缩响应。

## 时间安排（北京时间）

| 动作 | 时间 | 说明 |
|---|---|---|
| 生成随机目标 | 07:20 | 每天只抽一次 |
| 随机签到 | 07:30:00～21:29:59 | Durable Object Alarm 按真实随机目标触发 |
| 检查与故障恢复 | 20:00 | 若首次调度遗漏或未签到，恢复计划 |
| 失败重试 | 晚于随机目标 | 每账号最多 2 次额外尝试，间隔随机 5～30 分钟 |
| 最终兜底 | 23:45 | 仅处理未达重试上限且没有风控停止的账号 |

**注意**：随机目标精确到秒，但 Cloudflare Alarms 实际唤醒可能因平台调度延迟；不能保证签到真的发生在某一秒。北京时间固定为 UTC+8。

## 网页管理控制台（推荐）

部署后，直接打开你的 Worker 首页，例如 `https://ablesign.example.workers.dev/`，无需终端：

1. 在页面输入 Cloudflare Secret `ADMIN_TOKEN`，点击 **连接并查看状态**。
2. 查看 **随机签到目标时间**、**已签到账号数**、**下次唤醒时间**和**最近执行时间**。
3. 点击 **生成 / 恢复今日计划**，为当天安排随机签到（重复点击不会重抽）。
4. 点击 **立即签到 / 补签** 时会提示确认，只处理当天还未成功签到的账号。
5. 在 **Cookie 验证状态** 中查看各账号 Cookie 最近一次签到时的判定（有效、过期、受限、无法确认、尚未验证、未配置）及北京时间的最近验证时间；账号仅显示脱敏邮箱。
6. 点击 **清除口令** 可清空当前页面的管理员凭据。

**Cookie 状态是被动观测，不是实时探测。** 点击“连接”“刷新状态”只读取 Durable Object 已保存的记录，**不会访问科研通，也不会消耗签到/密码登录次数**。尚未签到时显示“尚未验证”；只有签到接口确认成功才标记“上次验证有效”，登录重定向/401/“请先登录”才标记“已失效”，403/429/验证码标记“受限制，无法确认”。网络问题不会被误判为过期。更新 Cloudflare Cookie Secret 后，旧 Cookie 的验证状态自动失效，显示“尚未验证”，待下次签到请求更新。状态仅说明过去某一时刻的响应，不保证当前会话仍有效。

网页口令只保留在当前页面的 JavaScript 内存中，不会写入 localStorage、Cookie、URL 或 GitHub。请始终通过 HTTPS 访问，不要将 ADMIN_TOKEN 透露给其他人。

> 若已使用一键部署且 GitHub 仓库之后发生更新：需要从 Cloudflare 项目重新部署最新版本，已保存的 Workers Secrets 不需要重新填写（除非更新覆盖了它们）。

## 查看状态 / 手动操作

```bash
export WORKER_URL="https://<your-worker>.<your-subdomain>.workers.dev"
export ADMIN_TOKEN="<your-admin-token>"

curl "$WORKER_URL/health"
curl -H "Authorization: Bearer $ADMIN_TOKEN" "$WORKER_URL/status"
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "$WORKER_URL/init"
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "$WORKER_URL/run"
```

- `/status`：当天随机目标、已完成数、下次补签时间、已使用密码登录配额的账号数、`riskStopped` 风控停止标记，以及 `cookieAccounts` 中各脱敏账号最近的 Cookie 状态（`status`：`not_configured`、`unchecked`、`valid`、`expired`、`restricted` 或 `unknown`；`checkedAt`：验证时间戳）。不返回 Cookie 原文或指纹；读取不发起网站请求。
- `/init`：初始化当天计划（当天已有计划则不会重新随机）。
- `/run`：**手动**立即处理尚未成功的账号（只有北京时间 07:30～23:59 才允许）。
- `/health`：公开健康检查，不包含秘密信息。

## 文件结构

```
src/
  index.js       # Worker 入口 + Durable Object 调度
  utils.js       # 北京时间、安全随机时刻、账号解析
  ablesci.js     # Cookie 优先、登录、CSRF、签到
  credentials.js # Secret 账号与 Cookie 映射
  notify.js      # PushPlus/Server酱/息知
tests/           # Node.js 单元测试
wrangler.jsonc   # Cron + SQLite Durable Object
.dev.vars.example
```

## 已知限制

- 科研通登录页可能更换 CSRF 或接口；本项目依据 [原仓库](https://github.com/jiandwei/ablesciSign) 2026 年 10 月的流程迁移。
- 站点风控验证码、IP 限制可能导致 Workers 登录失败；**不绕过验证码**。Cloudflare 部署成功不等于站点登录成功。
- 多账号执行和重试仍受 Cloudflare 账户资源配额限制。建议先配置一个测试账号，验证消息和签到结果。
- 原仓库与此仓库均为第三方自动化项目，请遵守科研通使用条款。

## 测试

```bash
npm test
```

本仓库不含任何真实账号、密码、登录 Cookie。
