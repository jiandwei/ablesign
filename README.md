# AbleSign · 科研通 Cloudflare Workers 真随机签到

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jiandwei/ablesign)

[👉 一键部署到 Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/jiandwei/ablesign)

将 [ablesciSign](https://github.com/jiandwei/ablesciSign) 的自动登录、签到、重试、多账号与消息通知移植到 **Cloudflare Workers + SQLite Durable Objects + Alarms**。

**提醒：本仓库是公开模板，但账号和密码必须通过 Cloudflare Worker Secrets 单独设置，绝不可提交到 GitHub。**

## 核心功能

- **真正随机**：每天北京时间 07:30:00～21:29:59 用 Web Crypto 安全随机数独立抽取一个目标秒数；不依赖每 15 分钟轮询确定时间。
- **持久化**：随机目标、已签到账号、失败次数由 SQLite Durable Object 保存。Worker 重启、重复调度也不会重新抽签。
- **失败补签**：签到失败后随机延迟重试，23:45 兜底；每次跳过当天已经确认签到成功的账号。
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

## 时间安排（北京时间）

| 动作 | 时间 | 说明 |
|---|---|---|
| 生成随机目标 | 07:20 | 每天只抽一次 |
| 随机签到 | 07:30:00～21:29:59 | Durable Object Alarm 按真实随机目标触发 |
| 检查与故障恢复 | 20:00 | 若首次调度遗漏或未签到，恢复计划 |
| 失败重试 | 晚于随机目标 | 每次随机延迟，避免频繁请求 |
| 最终兜底 | 23:45 | 仅处理仍未成功的账号 |

**注意**：随机目标精确到秒，但 Cloudflare Alarms 实际唤醒可能因平台调度延迟；不能保证签到真的发生在某一秒。北京时间固定为 UTC+8。

## 网页管理控制台（推荐）

部署后，直接打开你的 Worker 首页，例如 `https://ablesign.example.workers.dev/`，无需终端：

1. 在页面输入 Cloudflare Secret `ADMIN_TOKEN`，点击 **连接并查看状态**。
2. 查看 **随机签到目标时间**、**已签到账号数**、**下次唤醒时间**和**最近执行时间**。
3. 点击 **生成 / 恢复今日计划**，为当天安排随机签到（重复点击不会重抽）。
4. 点击 **立即签到 / 补签** 时会提示确认，只处理当天还未成功签到的账号。
5. 点击 **清除口令** 可清空当前页面的管理员凭据。

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

- `/status`：当天随机目标、已完成数、下一次补签时间。
- `/init`：初始化当天计划（当天已有计划则不会重新随机）。
- `/run`：**手动**立即处理尚未成功的账号（只有北京时间 07:30～23:59 才允许）。
- `/health`：公开健康检查，不包含秘密信息。

## 文件结构

```
src/
  index.js       # Worker 入口 + Durable Object 调度
  utils.js       # 北京时间、安全随机时刻、账号解析
  ablesci.js     # 登录、CSRF、Cookie、签到
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
