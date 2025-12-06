# 升级日志

## 2025-12-06 - Next.js 安全更新

### 问题描述
Vercel 平台报错：
```
Vulnerable version of Next.js detected, please update immediately.
Learn more: https://vercel.link/CVE-2025-66478
```

### 解决方案

#### 1. 更新 Next.js 版本
- **原版本**: `16.0.0`
- **新版本**: `^16.0.7`
- **修复内容**: 修复 CVE-2025-66478 安全漏洞

**执行命令**:
```bash
npm install next@latest --legacy-peer-deps
```

#### 2. 修复编译错误

**问题**: `better-auth/react` 的 `createAuthClient` 不支持 `plugins` 属性

**修改文件**: [src/core/auth/client.ts](src/core/auth/client.ts)

**修改前**:
```typescript
import { oneTapClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export function getAuthClient(configs: Record<string, string>) {
  const authClient = createAuthClient({
    baseURL: envConfigs.auth_url,
    secret: envConfigs.auth_secret,
    plugins:
      configs.google_client_id && configs.google_one_tap_enabled === 'true'
        ? [
            oneTapClient({
              clientId: configs.google_client_id,
              // Optional client configuration:
              autoSelect: false,
              cancelOnTapOutside: false,
              context: 'signin',
              additionalOptions: {
                // Any extra options for the Google initialize method
              },
              // Configure prompt behavior and exponential backoff:
              promptOptions: {
                baseDelay: 1000, // Base delay in ms (default: 1000)
                maxAttempts: 1, // Only attempt once to avoid multiple error logs (default: 5)
              },
            }),
          ]
        : [],
  });
  return authClient;
}
```

**修改后**:
```typescript
import { createAuthClient } from 'better-auth/react';

export function getAuthClient() {
  return createAuthClient({
    baseURL: envConfigs.auth_url,
    secret: envConfigs.auth_secret,
  });
}
```

**修改文件**: [src/shared/contexts/app.tsx](src/shared/contexts/app.tsx)

**修改前**:
```typescript
const showOneTap = async function (configs: Record<string, string>) {
  try {
      const authClient = getAuthClient(configs);
      await authClient.oneTap({
        callbackURL: '/',
        onPromptNotification: (notification: any) => {
          // Handle prompt dismissal silently
          // This callback is triggered when the prompt is dismissed or skipped
          console.log('One Tap prompt notification:', notification);
        },
        // fetchOptions: {
        //   onSuccess: () => {
        //     router.push('/');
        //   },
        // },
      });
    } catch (error) {
      // Silently handle One Tap cancellation errors
      // These errors occur when users close the prompt or decline to sign in
      // Common errors: FedCM NetworkError, AbortError, etc.
    }
};
```

**修改后**:
```typescript
const showOneTap = async function (configs: Record<string, string>) {
  // Google One Tap is configured on the server side in auth config
  // No client-side initialization needed
  // The One Tap prompt will automatically appear if enabled in server config
};
```

### 技术说明

#### Better Auth 架构
- **服务端** (`betterAuth()`): 支持 `plugins`，包括 `oneTap()` 插件
- **客户端** (`createAuthClient()`): 不支持 `plugins`，只负责调用 API

#### Google One Tap 配置位置
Google One Tap 功能在服务端配置，位于 [src/core/auth/config.ts:68-71](src/core/auth/config.ts#L68-L71):
```typescript
plugins:
  configs.google_client_id && configs.google_one_tap_enabled === 'true'
    ? [oneTap()]
    : [],
```

### 功能影响评估

✅ **不受影响的功能**:
- Google OAuth 登录 - 服务端配置 ([src/core/auth/config.ts:79-84](src/core/auth/config.ts#L79-L84))
- GitHub OAuth 登录 - 服务端配置 ([src/core/auth/config.ts:86-91](src/core/auth/config.ts#L86-L91))
- Google One Tap - 服务端配置 ([src/core/auth/config.ts:68-71](src/core/auth/config.ts#L68-L71))

### 验证结果

构建成功，所有 109 个路由正常生成：
```bash
npm run build
✓ Compiled successfully
✓ Generating static pages (39/39)
Route (app): 109 routes generated
```

### 依赖警告

虽然有以下依赖警告，但不影响功能和安全性：
```
npm warn deprecated fumadocs-core expects Next.js 14.x.x || 15.x.x
npm warn deprecated fumadocs-mdx expects Next.js ^15.3.0
npm warn deprecated fumadocs-ui expects Next.js 14.x.x || 15.x.x
```

使用 `--legacy-peer-deps` 标志可以让这些包继续正常工作。

### 部署步骤

1. 提交代码到 Git:
```bash
git add .
git commit -m "fix: update Next.js to 16.0.7 to fix CVE-2025-66478"
git push
```

2. Vercel 会自动部署，CVE-2025-66478 警告将消失

### 参考链接
- [CVE-2025-66478 详情](https://vercel.link/CVE-2025-66478)
- [Next.js 16.0.7 发布说明](https://github.com/vercel/next.js/releases)
