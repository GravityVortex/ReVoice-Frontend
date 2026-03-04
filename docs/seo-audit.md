# SEO 审计与修改建议（ReVoice-web-shipany-two）

更新时间：2026-03-04

本文基于当前代码仓库实际实现，对 SEO（收录、规范化、国际化、多语言、抓取效率、性能与富结果）进行审计，并给出可落地的修改建议与优先级。

---

## 本轮审计结论快照（可直接执行）

### P0（立即修复）

1. sitemap 失效且仍为占位域名  
   - 文件：`public/sitemap.xml`
   - 问题：仍是 `your-domain.com`，且未覆盖 `/{locale}/...` 真实路由
   - 建议：改为 `src/app/sitemap.ts` 动态生成，至少覆盖 en/zh + 首页 + pricing + showcases + docs + lastmod

2. robots 与多语言路由不匹配  
   - 文件：`public/robots.txt`
   - 问题：仅屏蔽 `/settings/*` 等无 locale 前缀路径，实际路由为 `/{locale}/...`；引入了对已重定向路径（如 `/privacy-policy`）的冗余 Disallow。
   - 建议：改为 `src/app/robots.ts`，按 locale 屏蔽私有路由，清理过时的 Disallow 规则，并补充 `Sitemap:` 指向。

3. canonical/hreflang 存在全站级误配风险  
   - 文件：`src/app/layout.tsx`、`src/app/[locale]/layout.tsx`、`src/shared/lib/seo.ts`
   - 问题：
     - `src/app/layout.tsx` 的 alternate 固定指向语言首页（不含当前路径）
     - `src/app/[locale]/layout.tsx` 通过 `generateMetadata = getMetadata()` 让大量页面继承默认 canonical
     - `getCanonicalUrl()` 中的 trailing slash 逻辑硬编码了 `'en'` 并且会导致非统一的斜杠处理。
     - 多个页面的 canonical 拼接仍按旧逻辑：`const canonicalUrl = locale !== envConfigs.locale ? ${envConfigs.app_url}/${locale}/... : ${envConfigs.app_url}/...;`，和 `localePrefix='always'` 冲突
   - 建议：
     - 移除全局固定 alternate 注入，在 `getMetadata()` 补充 `alternates.languages`（按页面传入的 `canonicalUrl` 生成，含 `x-default`）。
     - 禁止在 layout 层默认输出 canonical=`/`，只在页面显式传入 canonical 时输出
     - canonical 统一输出 `https://<domain>/{locale}/...` 并且全局统一去除所有的 trailing slash，配合 `vercel.json` 中的 `trailingSlash: false`。

4. 首页（Landing Page）缺少 `generateMetadata`
   - 文件：`src/app/[locale]/(landing)/page.tsx`
   - 问题：该页面没有导出 `generateMetadata`，完全依赖 `[locale]/layout.tsx` 的默认 metadata。作为流量最大的页面，缺乏独立控制。
   - 建议：补充 `generateMetadata`，显式设置首页的 title/description/canonical/OG。

5. `twitter.site` 配置错误
   - 文件：`src/shared/lib/seo.ts`
   - 问题：`twitter.site` 被设为 `envConfigs.app_url`（如 URL）。Twitter `site` 字段应为 Twitter 账号（如 `@SoulDub`）。
   - 建议：新增环境变量 `NEXT_PUBLIC_TWITTER_HANDLE`，或硬编码正确的 Twitter handle。

6. 私有页可能被索引  
   - 文件：`src/app/[locale]/(auth)/...`、`(admin)`、`(dashboard)`、`(chat)`、`settings`、`video_convert`
   - 问题：未统一 `noindex`
   - 建议：对应 layout 增加 `robots: { index: false, follow: false }`

7. 软 404与错误处理
   - 问题：尽管 `docs/[[...slug]]/page.tsx` 正确使用了 `notFound()`，但需要确认全站不存在内容的处理标准。
   - 建议：确保所有动态详情页在无内容时均调用 `notFound()`，而不是返回空态组件。

8. 线上域名未配置会导致 canonical/OG 全局异常  
   - 文件：`src/config/index.ts`
   - 问题：`NEXT_PUBLIC_APP_URL` 默认回退为 `http://localhost:3000`；同时需要保证 `NEXT_PUBLIC_DEFAULT_LOCALE` 与 locales 配置中的 `defaultLocale='en'` 完全一致。一旦环境变量错配，会直接污染所有生成的 URL 和 SEO 标签。
   - 建议：上线前强制校验环境变量（构建时 fail-fast）。

### P1（本周完成）

1. Privacy / Terms 重定向链风险
   - 文件：`next.config.mjs`
   - 问题：将 `/:locale(en|zh)/privacy` 永久重定向到无前缀的 `/privacy`。若线上启用了“强制 locale 前缀”的 middleware（例如 next-intl middleware），可能出现重定向链/循环（需线上验证）。
   - 建议：确保 legal 页面（`/privacy`、`/terms` 等）在 middleware 中被跳过；并用 `curl -I -L` 验证最终落地 URL 一步到位。

2. `vercel.json` 与 Canonical 协调
   - 文件：`vercel.json`
   - 问题：存在 `cleanUrls: true` 和 `trailingSlash: false`。
   - 建议：确保生成的 metadata 里的 canonical URL、hreflang 以及 OpenGraph URL 也符合这些去除后缀和斜杠的标准，保持全网 URL 的一致性规范。

3. 缓存策略过重  
   - 文件：`next.config.mjs`
   - 问题：`/:path*` 全站 `no-store`
   - 建议：仅对敏感动态内容 no-store，公开内容启用合理缓存

4. 结构化数据缺失（JSON-LD）  
   - 文件：`src/app/layout.tsx`、`src/app/[locale]/(docs)/docs/[[...slug]]/page.tsx`
   - 建议：首页加 `Organization/WebSite`，文档加 `TechArticle/BreadcrumbList`

5. 可索引内容仍有模板占位文案  
   - 文件：`content/docs/*.mdx`、`content/pages/*.mdx` 等
   - 建议：替换 `YourAppName` 和 `your-domain.com` 为真实品牌与真实场景内容。特别注意 **隐私政策和服务条款 (Privacy/Terms) 等法律文本** 的占位替换非常关键，建议专业人员过审。

6. 根路径跳转建议使用永久重定向（308）  
   - 文件：`src/app/page.tsx`
   - 问题：当前使用 `redirect()`，对 SEO 更推荐 308（永久）以稳定规范 URL
   - 建议：改用 `permanentRedirect()` 或在 `next.config.mjs` 使用永久 redirects

### P2（体验与 CTR 优化）

1. 关键区块图片仍大量使用 `<img>`  
   - 文件：`src/themes/default/blocks/hero.tsx`、`showcases.tsx`、`testimonials.tsx`
   - 建议：关键图替换为 `next/image`，补 `sizes` 与明确尺寸

2. 图片 alt 偏泛化（已确认）
   - 文件：`src/config/locale/messages/en/showcases.json`、`src/config/locale/messages/zh/showcases.json`
   - 现状：已确认 alt 为泛化文本（例如 `showcases` / `案例展示`），可检索性弱且重复度高。
   - 建议：改为“产品名 + 场景 + 能力/结果”的可检索语义，避免全站重复。

3. manifest 品牌占位  
   - 文件：`public/favicons/manifest.json`
   - 建议：统一品牌名与短名

### 建议执行顺序（7 天）

1. D1-D2：sitemap + robots + canonical/hreflang + noindex + 修复 trailing slash / twitter.site  
2. D3-D4：首页增加 metadata + JSON-LD  
3. D5-D7：内容替换（尤其是法律页面占位）+ 图片（WebP/next/image）优化

---


## 1. 项目现状与审计范围

### 1.1 技术栈与路由形态

- Next.js App Router（`src/app`）
- 多语言：next-intl，路由在 `src/app/[locale]/...`
- 边缘配置影响：`vercel.json` 启用了 `cleanUrls: true` 和 `trailingSlash: false`
- 语言配置：
  - `locales = ['en','zh']`
  - `defaultLocale = 'en'`
  - `localePrefix = 'always'`（默认语言也必须带 `/en` 前缀）
  - `localeDetection = false`
  - 见：`src/config/locale/index.ts`

### 1.2 关键审计入口文件

- 全局 HTML/head：`src/app/layout.tsx`
- locale layout（默认 metadata 注入）：`src/app/[locale]/layout.tsx`
- metadata helper：`src/shared/lib/seo.ts`
- robots/sitemap（当前是 public 静态文件）：`public/robots.txt`、`public/sitemap.xml`
- 缓存策略与重定向：`next.config.mjs` 和 `vercel.json`
- 典型页面 metadata：
  - Landing：`src/app/[locale]/(landing)/page.tsx`
  - 列表页：`src/app/[locale]/(landing)/pricing/page.tsx`
  - Docs：`src/app/[locale]/(docs)/docs/[[...slug]]/page.tsx`


## 2. 结论概览（强影响点）

- canonical 当前存在“全站被规范化到首页”的高风险：大量页面会输出 canonical=`/{locale}/`（本质等价于首页），且 trailing slash 和 locale 的旧逻辑相互冲突。
- hreflang（alternate 语言链接）当前按语言“首页”输出，且 `getMetadata()` 中没有补齐 `alternates.languages`，属于明显误配。
- 首页缺少独立的 `generateMetadata` 控制，作为流量大头不利于传播曝光。
- `public/sitemap.xml` 为占位模板（`your-domain.com`），`public/robots.txt` 未适配多语言，并且两者不支持自动化同步。
- 缓存策略过度激进全站 `no-store`；关键图片过大影响 Core Web Vitals (LCP)；基础文档包含大量的默认名称和地址占位。


## 3. P0（必须优先修复）

### 3.1 canonical 逻辑错误：会导致大量页面被“规范化到首页”

现象：
- `src/app/[locale]/layout.tsx` 中 `export const generateMetadata = getMetadata();`
- `src/shared/lib/seo.ts` 的 `getCanonicalUrl()` 在未传入 `canonicalUrl` 时会默认使用 `'/'`
- 结果：很多没有单独实现 `generateMetadata` 的页面，会继承 layout 的 canonical，最终 canonical 指向 `/{locale}/`（首页）

建议：
1) 不要在 `[locale]/layout.tsx` 层对所有页面“默认输出 canonical=/”
2) `getMetadata()` 仅在调用方显式传入 `canonicalUrl` 时才返回 `alternates.canonical`（以及 OG url）
3) 首页的 `src/app/[locale]/(landing)/page.tsx` 单独导出 `generateMetadata`。
4) 各具体页面自行输出正确规范化的 canonical。


### 3.2 hreflang 输出错误：未随页面路径变化

现象：
- `src/app/layout.tsx` 中全局遍历 `locales` 并写死了 href：`${appUrlBase}/${loc}`
- `src/shared/lib/seo.ts` 生成的元数据中，仅提供了 `canonical` 却没提供 `languages`

风险：
- 用户访问 `/en/pricing` 时会指明它的另一个语言版本是 `/zh/` 首页，严重影响多语言站点的排名。

建议：
- 移除 `src/app/layout.tsx` 里“全局固定的 alternate 注入”
- 不要在 helper 里“猜当前 pathname”；改为由每个可索引页面显式传入 `canonicalUrl`（相对路径），由 `getMetadata()` 基于该值同时生成 `alternates.canonical` 与 `alternates.languages`（`en`/`zh`/`x-default`），并统一去除尾部 `/` 以匹配 `trailingSlash: false`。


### 3.3 sitemap.xml 为模板占位，且不匹配 `localePrefix=always`

建议：
- 使用 App Router metadata route 生成 sitemap：新增 `src/app/sitemap.ts` 动态输出真实域名与路由（至少覆盖 en/zh 的首页、pricing、showcases、docs，并补 lastmod）；并删除废弃的 `public/sitemap.xml`。


### 3.4 robots.txt 失配与重定向链风险

问题：
- `public/robots.txt` 中的 Disallow 规则没有涵盖 `/[locale]/...`：例如屏蔽 `/settings/*` 但现在的实际访问路径会带有地域。
- `robots.txt` 里面存在 `Disallow: /privacy-policy`，但 `next.config.mjs` 中已将该路径永久重定向（308）到 `/privacy`；若线上启用了“强制 locale 前缀”的 middleware，需要确认不会形成重定向链/循环。

建议：
- 使用 `src/app/robots.ts` 动态生成。
- 明确 `Sitemap: https://<domain>/sitemap.xml`
- 梳理重定向链，清理旧名字的 Disallow 以及确保 `/[locale]/` 的前缀覆盖，例如 `Disallow: /*/settings/`。


### 3.5 基础 SEO 配置（Twitter / trailingSlash 错误）

问题：
- `seo.ts` 中 `twitter.site` 等于 `envConfigs.app_url` (http 链接)。
- trailing slash 中仅对 `locale !== 'en'` 以及基于 URL 结束是否含有 `/` 判断切分代码（硬编码了 `'en'`）。

建议：
- 将 `twitter.site` 设置成 Twitter 用户名（如果暂时没有，可以留空或者从环境变量中读取句柄）。
- 基于 `defaultLocale` 来判断 locale 情况，且统一使用剥离结尾斜杠的 URL 字符串匹配 Vercel 的规则。


## 4. P1（建议尽快做：提升索引质量与稳定性）

### 4.1 私有/低价值页面统一 noindex

建议对以下布局增加 `metadata.robots = { index:false, follow:false }`：
- `src/app/[locale]/(auth)/layout.tsx`
- `src/app/[locale]/(admin)/layout.tsx`
- `src/app/[locale]/(dashboard)/layout.tsx`
- `src/app/[locale]/(chat)/layout.tsx`
- `src/app/[locale]/(landing)/settings/layout.tsx`
- `src/app/[locale]/(landing)/video_convert/layout.tsx`


### 4.2 canonical 生成策略不统一（旧的生成遗留代码）

现状代码：
```typescript
const canonicalUrl = locale !== envConfigs.locale
? `${envConfigs.app_url}/${locale}/...`
: `${envConfigs.app_url}/...`;
```

建议：
- 在 `[slug]/page.tsx` 等存在自定义 metadata 页面中统一改为带 `/{locale}/` 的拼接格式。


### 4.3 基础文本内容的合规性审查

建议：
- `content/pages/privacy-policy.mdx` 以及 `terms-of-service.mdx`（包含对应的中英双语文件）当中多处使用了 `YourAppName` 及 `your-domain.com` 占位和邮箱地址。对于直接对外的合规文本具有法务风险，需全部核对为自己真实的品牌主体和邮箱及平台域名。


## 5. P1（性能与抓取效率：间接影响排名）

### 5.1 缓存头过度激进（no-store）

建议：
- 去除 `next.config.mjs` 中全局 `/:path*` 的 `Cache-Control: no-store`。为动态内容设计合理的路由重算或基于路由局部进行缓存禁止。至少需留存静态图片与文档等正常缓存。


### 5.2 首屏关键图片压缩

建议：
- 将 `public/imgs/` 几十 MB 的高分 PNG 压缩为 WebP/AVIF。
- 关键 Hero 区域弃用普通的 `<img>` 元素，换上 `next/image` 并带有 `priority`。


## 6. P2（可选：提升 CTR/富结果）

结构化数据 JSON-LD：建议至少覆盖 WebSite 机构信息至全站、面包屑以及文章详情元结构信息，提升搜索引擎结果中的卡片样式。

## 7. 验收清单（上线前自检）

- 抽拉检查首页以及详情页
  - 确认每页 canonical 指向自身而非根路径
  - hreflang 输出不同语言同页面的映射
  - 检查不存在 URL 后缀 `/`，符合 Vercel 配置
- 使用 Twitter Card Validator 验证 Twitter 信息无误
- 验证环境变量 `NEXT_PUBLIC_APP_URL` 及其对应的环境生效
- Lighthouse (Web Vitals) 显示 LCP 符合预期（小于 2.5s）
- 法律文档不存在 `your-domain.com` 关键字
