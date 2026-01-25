# Google / GitHub 登录（OAuth）配置记录

本项目使用 **better-auth** 做第三方登录。切换域名（比如换了新的 Vercel 域名/自定义域名）后登录失效，最常见原因是 **OAuth 回调地址（redirect URI / callback URL）不匹配**，以及 **应用自身的 base URL 环境变量没同步更新**。

生产域名（当前）：`https://www.souldub.ai`（如果你实际使用的是 `https://souldub.ai`，下面所有 URL 里的域名要保持一致替换）

## 1) 本项目实际用到的回调地址

代码入口是 Next.js 的 catch-all 路由：`src/app/api/auth/[...all]/route.ts`，better-auth 默认 `basePath` 是 `/api/auth`，OAuth 回调端点是 `/callback/:id`（其中 `:id` 是 `google` / `github`）。

因此生产环境需要在第三方控制台配置的回调地址是（SoulDub.ai）：

- Google：`https://www.souldub.ai/api/auth/callback/google`
- GitHub：`https://www.souldub.ai/api/auth/callback/github`

如果你使用 apex 域名（不带 www），则是：

- Google：`https://souldub.ai/api/auth/callback/google`
- GitHub：`https://souldub.ai/api/auth/callback/github`

本地开发（可选）：

- Google：`http://localhost:3000/api/auth/callback/google`
- GitHub：`http://localhost:3000/api/auth/callback/github`

重要：**GitHub OAuth App 只允许配置一个 callback URL**。如果你既要本地开发又要线上生产，建议创建两套 GitHub OAuth App（Local/Prod 各一套）。

## 2) 先确定“稳定域名”

第三方登录强依赖域名稳定性：

- 生产：建议使用稳定的自定义域名（例如 `https://www.souldub.ai`）
- Vercel Preview：域名会变（`*.vercel.app`），GitHub 无法为每个 Preview 都配回调地址，所以 **Preview 上 GitHub 登录通常不可用**

## 3) Vercel 环境变量（必须）

在 Vercel 的 Project Settings → Environment Variables（至少 Production 环境）设置：

- `NEXT_PUBLIC_APP_URL=https://www.souldub.ai`
- `AUTH_URL=https://www.souldub.ai`
- `AUTH_SECRET=<RANDOM_BASE64_32_BYTES>`

要求：

- 必须带协议 `https://`
- 不要写 path（不要写成 `https://<YOUR_DOMAIN>/api/auth`）
- `www`/非 `www` 要和你在控制台配置的域名保持一致

生成 `AUTH_SECRET` 示例：

```bash
openssl rand -base64 32
```

## 4) 在项目里写入 client id / secret（必须）

本项目的第三方登录配置来自数据库 `config` 表（字段：`name`, `value`），并且有后台设置页可以写入。

方式 A：后台页面（推荐）

1. 使用管理员账号登录
1. 打开（任选一个 locale 前缀）：
   - `https://www.souldub.ai/en/admin/settings/auth`
   - `https://www.souldub.ai/zh/admin/settings/auth`
1. 填入并保存：
   - Google：`google_client_id`, `google_client_secret`
   - GitHub：`github_client_id`, `github_client_secret`

备注：后台里有 `google_auth_enabled` / `github_auth_enabled` 开关，但真正是否启用 provider 取决于 `*_client_id` + `*_client_secret` 是否存在（两者缺一不可）。

方式 B：直接改数据库（你有 DB 权限时）

PostgreSQL 示例（有则更新、无则插入）：

```sql
insert into config (name, value) values
  ('google_client_id',     '<GOOGLE_CLIENT_ID>'),
  ('google_client_secret', '<GOOGLE_CLIENT_SECRET>'),
  ('github_client_id',     '<GITHUB_CLIENT_ID>'),
  ('github_client_secret', '<GITHUB_CLIENT_SECRET>')
on conflict (name) do update set value = excluded.value;
```

## 5) Google 控制台配置步骤（OAuth Client）

入口：

- Google Cloud Console：https://console.cloud.google.com/
- APIs & Services：https://console.cloud.google.com/apis/dashboard
- OAuth consent screen：https://console.cloud.google.com/apis/credentials/consent
- Credentials：https://console.cloud.google.com/apis/credentials

1. 选择/创建一个 Project
1. OAuth consent screen（同意屏幕）
   - User type：通常选 **External**
   - Authorized domains：填你的域名（例如 `souldub.ai`）
   - 如果处于 **Testing**：
     - 只有 “Test users” 列表里的账号能登录
     - 想要“所有人都能用”，需要发布到 Production（并按要求补全资料/验证）
1. Credentials → Create Credentials → OAuth client ID
   - Application type：**Web application**
   - Authorized JavaScript origins：
     - `https://www.souldub.ai`
     - （可选）`http://localhost:3000`
   - Authorized redirect URIs：
     - `https://www.souldub.ai/api/auth/callback/google`
     - （可选）`http://localhost:3000/api/auth/callback/google`
1. 创建完成后复制：
   - Client ID → 写到 `google_client_id`
   - Client secret → 写到 `google_client_secret`

## 6) GitHub 控制台配置步骤（OAuth App）

入口：

- Developer settings：https://github.com/settings/developers
- OAuth Apps 列表：https://github.com/settings/applications
- New OAuth App：https://github.com/settings/applications/new

1. New OAuth App
   - Application name：随意（例如 `SoulDub.ai`）
   - Homepage URL：`https://www.souldub.ai`
   - Authorization callback URL：`https://www.souldub.ai/api/auth/callback/github`
1. 创建完成后：
   - Client ID → 写到 `github_client_id`
   - Generate a new client secret → 写到 `github_client_secret`

注意：

- GitHub OAuth App 默认不限制“只能某个账号登录”，通常是 **任何 GitHub 用户都可以授权登录**。
- 真要限制登录人群，需要在你自己的业务逻辑里做白名单/域名校验（当前项目未做）。

## 7) 验证与排错

验证：

1. 打开站点登录弹窗/登录页，点击 Google/GitHub
1. 完成授权后应返回到站点，并且 `GET /api/auth/get-session` 能拿到 session（浏览器带 cookie）

常见错误：

- Google `redirect_uri_mismatch`：控制台里没加 `https://<YOUR_DOMAIN>/api/auth/callback/google`，或 `www`/非 `www` 不一致
- GitHub `The redirect_uri is not associated with this application`：callback URL 不一致（GitHub 只认一个）
- 登录页跳回旧域名：`AUTH_URL` / `NEXT_PUBLIC_APP_URL` 仍然是旧值
- Google 只允许你自己的账号登录：OAuth consent screen 还在 **Testing**，且只有 test users 能用
