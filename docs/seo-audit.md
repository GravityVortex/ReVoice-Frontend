# SEO 审计与修改建议（ReVoice-web-shipany-two）

更新时间：2026-03-04

本文基于当前代码仓库实际实现，对 SEO（收录、规范化、国际化、多语言、抓取效率、性能与富结果）进行审计，并给出可落地的修改建议与优先级。

---

## 本轮审计结论快照（可直接执行）

### P0（立即修复）

1. sitemap 失效且仍为占位域名  
   - 文件：`public/sitemap.xml`
   - 问题：仍是 `your-domain.com`，且未覆盖 `/{locale}/...` 真实路由
   - 建议：改为 `src/app/sitemap.ts` 动态生成，覆盖 en/zh + blog + docs + lastmod

2. robots 与多语言路由不匹配  
   - 文件：`public/robots.txt`
   - 问题：仅屏蔽 `/settings/*` 等无 locale 前缀路径，实际路由为 `/{locale}/...`
   - 建议：改为 `src/app/robots.ts`，按 locale 屏蔽私有路由并补 `Sitemap:`

3. canonical/hreflang 存在全站级误配风险  
   - 文件：`src/app/layout.tsx`、`src/app/[locale]/layout.tsx`、`src/shared/lib/seo.ts`
   - 问题：
     - `src/app/layout.tsx` 的 alternate 固定指向语言首页（不含当前路径）
     - `src/app/[locale]/layout.tsx` 通过 `generateMetadata = getMetadata()` 让大量页面继承默认 canonical
     - 部分页面 canonical 拼接仍按“默认语言不带前缀”的旧逻辑，和 `localePrefix='always'` 冲突
   - 建议：
     - 移除全局固定 alternate 注入，改为 Metadata `alternates.languages`（按页面路径生成，含 `x-default`）
     - 禁止在 layout 层默认输出 canonical=`/`，只在页面显式传入 canonical 时输出
     - canonical 统一输出 `https://<domain>/{locale}/...`

4. 私有页可能被索引  
   - 文件：`src/app/[locale]/(auth)/...`、`(admin)`、`(dashboard)`、`(chat)`、`settings`、`video_convert`
   - 问题：未统一 `noindex`
   - 建议：对应 layout 增加 `robots: { index: false, follow: false }`

5. 软 404  
   - 文件：`src/app/[locale]/(landing)/blog/[slug]/page.tsx`、`src/app/[locale]/(landing)/blog/category/[slug]/page.tsx`
   - 问题：缺失内容返回空态组件而非真实 404
   - 建议：不存在内容统一 `notFound()`

6. 线上域名未配置会导致 canonical/OG 全部指向 localhost  
   - 文件：`src/config/index.ts`
   - 问题：`NEXT_PUBLIC_APP_URL` 默认回退为 `http://localhost:3000`，一旦线上环境未正确配置，会直接污染 canonical、OG url、Twitter site 等
   - 建议：上线前强制校验环境变量（构建时 fail-fast 或健康检查），并确保 `NEXT_PUBLIC_APP_URL` 为正式域名

### P1（本周完成）

1. 公开页 metadata 覆盖不完整  
   - 文件：`src/app/[locale]/(landing)/(ai)/ai-chatbot/page.tsx`、`ai-video-generator/page.tsx`、`ai-audio-generator/page.tsx`
   - 建议：补全 `generateMetadata`（title/description/canonical/alternates）

2. 结构化数据缺失（JSON-LD）  
   - 文件：`src/app/layout.tsx`、`src/app/[locale]/(landing)/blog/[slug]/page.tsx`、`src/app/[locale]/(docs)/docs/[[...slug]]/page.tsx`
   - 建议：首页加 `Organization/WebSite`，博客加 `BlogPosting`，文档加 `TechArticle/BreadcrumbList`

3. 缓存策略过重  
   - 文件：`next.config.mjs`
   - 问题：`/:path*` 全站 `no-store`
   - 建议：仅对敏感动态内容 no-store，公开内容启用合理缓存

4. 可索引内容仍有模板占位文案  
   - 文件：`content/posts/*.mdx`、`content/docs/*.mdx`、`content/pages/*.mdx`
   - 建议：替换 `YourAppName/your-domain` 为真实品牌与真实场景内容

5. 根路径跳转建议使用永久重定向（308）  
   - 文件：`src/app/page.tsx`
   - 问题：当前使用 `redirect()`，对 SEO 更推荐 308（永久）以稳定规范 URL
   - 建议：改用 `permanentRedirect()` 或在 `next.config.mjs` 使用永久 redirects

### P2（体验与 CTR 优化）

1. 关键区块图片仍大量使用 `<img>`  
   - 文件：`src/themes/default/blocks/hero.tsx`、`showcases.tsx`、`blog.tsx`、`testimonials.tsx`
   - 建议：关键图替换为 `next/image`，补 `sizes` 与明确尺寸

2. 图片 alt 偏泛化  
   - 文件：`src/config/locale/messages/en/showcases.json`、`src/config/locale/messages/zh/showcases.json`
   - 建议：改为可检索语义（场景+任务+结果），避免重复“showcases/案例展示”

3. manifest 品牌占位  
   - 文件：`public/favicons/manifest.json`
   - 建议：统一品牌名与短名

### 建议执行顺序（7 天）

1. D1-D2：sitemap + robots + canonical/hreflang + noindex + 软404  
2. D3-D4：补全公开页 metadata + JSON-LD  
3. D5-D7：内容替换（去模板占位）+ 图片与 alt 优化

---


## 1. 项目现状与审计范围

### 1.1 技术栈与路由形态

- Next.js App Router（`src/app`）
- 多语言：next-intl，路由在 `src/app/[locale]/...`
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
- 缓存策略：`next.config.mjs`
- 典型页面 metadata：
  - 列表页：`src/app/[locale]/(landing)/pricing/page.tsx`、`src/app/[locale]/(landing)/blog/page.tsx`
  - 详情页：`src/app/[locale]/(landing)/blog/[slug]/page.tsx`、`src/app/[locale]/(landing)/[slug]/page.tsx`
  - Docs：`src/app/[locale]/(docs)/docs/[[...slug]]/page.tsx`


## 2. 结论概览（强影响点）

- canonical 当前存在“全站被规范化到首页”的高风险：大量页面会输出 canonical=`/{locale}/`（本质等价于首页）。
- hreflang（alternate 语言链接）当前按语言“首页”输出，不包含当前路径，属于明显误配。
- `public/sitemap.xml` 为占位模板（`your-domain.com`），且未覆盖 `/{locale}/...` 真实路径。
- `public/robots.txt` 的 Disallow 规则未适配 `/{locale}` 前缀；同时缺少 Sitemap 声明。
- 缓存策略过度激进：`next.config.mjs` 给 `/:path*` 下发 `no-store`，会拖累抓取效率与性能（含图片等静态资源）。
- 首屏关键图片体积偏大（多张 1MB~2MB 级 PNG），会显著影响 LCP 与排名。


## 3. P0（必须优先修复）

### 3.1 canonical 逻辑错误：会导致大量页面被“规范化到首页”

现象：
- `src/app/[locale]/layout.tsx` 中 `export const generateMetadata = getMetadata();`
- `src/shared/lib/seo.ts` 的 `getCanonicalUrl()` 在未传入 `canonicalUrl` 时会默认使用 `'/'`
- 结果：很多没有单独实现 `generateMetadata` 的页面，会继承 layout 的 canonical，最终 canonical 指向 `/{locale}/`（首页）

风险：
- 重复内容被合并、子页面权重被转移到首页
- 收录数量下降、长尾页面几乎不可能进入索引

建议：
1) 不要在 `[locale]/layout.tsx` 层对所有页面“默认输出 canonical=/”
2) `getMetadata()` 仅在调用方显式传入 `canonicalUrl` 时才返回 `alternates.canonical`（以及 OG url）
3) 对重要页面（docs/blog/detail）自行输出正确 canonical


### 3.2 hreflang 输出错误：未随页面路径变化

现象：
- `src/app/layout.tsx` 中注入：
  - `<link rel="alternate" hrefLang={loc} href={`${appUrlBase}/${loc}`} />`
- 这会导致你在 `/en/pricing`、`/zh/blog/xxx` 等页面，也输出指向语言首页的 alternate。

风险：
- hreflang 误配会造成错误的语言/地区聚合，严重时影响收录与排序稳定性。

建议：
- 移除 `src/app/layout.tsx` 里“全局固定的 alternate 注入”
- 使用 Next.js metadata 的 `alternates.languages`，按“当前路径”生成多语言对应 URL
  - 注意：`generateMetadata()` 默认拿不到 request pathname，最佳实践是“每个页面/路由组显式传入 canonicalUrl（相对路径）并生成 languages”
  - 若强行从请求头/URL 推断路径，会让 metadata 变得更动态，可能影响静态化与缓存（需结合产品实际取舍）


### 3.3 sitemap.xml 为模板占位，且不匹配 `localePrefix=always`

现象：
- `public/sitemap.xml` 包含 `https://your-domain.com/...`
- 同时未覆盖 `/{locale}` 的真实路径结构

风险：
- 搜索引擎将忽略/误解 sitemap，导致抓取入口缺失

建议：
- 使用 App Router metadata route 生成 sitemap：
  - 新增 `src/app/sitemap.ts` 动态输出真实域名与全量路由（至少覆盖 landing/blog/showcases/pricing/docs）
- 并避免与 `public/sitemap.xml` 同名冲突（建议删除或改名旧文件；如需保留，请确认部署后只保留一个入口）


### 3.4 robots.txt 不匹配多语言前缀，且缺少 Sitemap 声明

现象：
- `public/robots.txt` 中如 `Disallow: /settings/*`，但实际页面是 `/en/settings/...`、`/zh/settings/...`

风险：
- 需要屏蔽的私有页可能被收录
- 需要开放的页面可能被误抓取浪费预算（crawl budget）

建议：
- 使用 `src/app/robots.ts` 动态生成：
  - 明确 `Sitemap: https://<domain>/sitemap.xml`
  - Disallow 规则适配 `/{locale}`（例如 `Disallow: /*/settings/` 或分别列出 `/en/settings/`、`/zh/settings/`）


## 4. P1（建议尽快做：提升索引质量与稳定性）

### 4.1 私有/低价值页面统一 noindex

现状：
- `src/shared/lib/seo.ts` 支持 `noIndex`，但项目中基本未使用

建议：
- 对以下布局或路由群增加 `metadata.robots = { index:false, follow:false }`（或调用 `getMetadata({ noIndex:true })`）：
  - `src/app/[locale]/(auth)/layout.tsx`
  - `src/app/[locale]/(admin)/layout.tsx`
  - `src/app/[locale]/(dashboard)/layout.tsx`
  - `src/app/[locale]/(chat)/layout.tsx`
  - `src/app/[locale]/(landing)/settings/layout.tsx`
  - `src/app/[locale]/(landing)/video_convert/layout.tsx`


### 4.2 canonical 生成策略不统一（与 `localePrefix=always` 冲突）

现状：
- 多个页面仍在按“默认语言不带前缀”的逻辑拼 canonical（`locale !== envConfigs.locale ? /{locale}/... : /...`）
  - 典型：`src/app/[locale]/(landing)/blog/[slug]/page.tsx`
  - 典型：`src/app/[locale]/(landing)/[slug]/page.tsx`
- 但当前路由策略是 `localePrefix='always'`，即 `/blog/...` 这种路径理论上不应作为规范 URL

建议：
- canonical 统一输出为：`https://<domain>/{locale}/...`（包含默认语言）
- 同步修正 `alternates.languages` 的对应关系


### 4.3 Docs/Blog 详情页补齐 OG/Twitter 与 canonical（避免继承错误）

现状：
- docs：`src/app/[locale]/(docs)/docs/[[...slug]]/page.tsx` 的 `generateMetadata` 只返回 title/description
- blog detail：部分页面仅返回 canonical/title/description，缺少 og/twitter 图片与站点信息

建议：
- docs、blog detail 的 `generateMetadata` 补齐：
  - `alternates.canonical`
  - `openGraph`、`twitter`
  - 若有封面图：`openGraph.images`


## 5. P1（性能与抓取效率：间接影响排名）

### 5.1 缓存头过度激进（no-store）

现状：
- `next.config.mjs` 对 `/:path*` 下发：
  - `Cache-Control: no-store, must-revalidate`
- 这会影响图片（含 `/_next/image`）、public 静态资源缓存，导致重复下载、抓取变慢。

建议：
- 移除全站 `/:path*` 的 no-store；或改为仅对真正的动态私有接口下发 no-store
- 至少为这些路径单独配置合理缓存：
  - `/_next/static/*`（已有 immutable）
  - `/_next/image`、`/favicons/*`、`/imgs/*`、`/*.png` 等


### 5.2 首屏图片体积过大，影响 LCP

现状（示例）：
- `public/big.png` 约 2.2MB
- `public/logo.png` 约 1.5MB
- `public/imgs` 目录总体积约 29MB（大量 1MB~2MB PNG）

建议：
- 将首屏关键图片转为 WebP/AVIF 并压缩（目标：几十 KB 级）
- `src/themes/default/blocks/hero.tsx` 中首屏图片建议改用 `next/image`：
  - `priority`
  - 合理 `sizes`
  - 避免 layout shift


## 6. P2（可选：提升 CTR/富结果）

当前未发现 JSON-LD/结构化数据注入（代码搜索无 `application/ld+json`）。

建议按页面类型增加：
- Organization / WebSite（全站）
- SoftwareApplication / Product（产品页）
- FAQPage（落地页 FAQ）
- BlogPosting（博客详情）
- BreadcrumbList（docs/blog 列表与详情）


## 7. 推荐落地顺序（最小改动换最大收益）

1) 统一 URL 策略：既然 `localePrefix='always'`，则 canonical/hreflang 全量带 `/{locale}`
2) 修 metadata：
   - 移除 `[locale]/layout.tsx` 默认 canonical=`/`
   - 修复 `src/app/layout.tsx` 的 hreflang 注入方式（按路径而不是按语言首页）
3) 上 `robots.ts` + `sitemap.ts`，替换占位的 `public/robots.txt` / `public/sitemap.xml`
4) 调整缓存策略（去掉全站 no-store），并压缩首屏图片（提升 CWV）
5) 结构化数据与 OG/Twitter 完善


## 8. 验收清单（上线前自检）

- 随机抽查 10 个页面（landing/blog/detail/docs/settings 等），确认：
  - 每页 canonical 指向自身而非首页
  - hreflang 指向“同路径不同语言”的页面
- `GET /sitemap.xml` 返回真实域名、真实路由（含 `/en`、`/zh`）
- `GET /robots.txt` 含 `Sitemap:` 且 Disallow 命中真实多语言路径
- `NEXT_PUBLIC_APP_URL` 在生产环境为正式域名（禁止回退到 localhost）
- `/` 跳转到 `/{defaultLocale}` 使用永久重定向（308）
- Lighthouse / Web Vitals：
  - LCP 显著改善（首屏图片体积、缓存命中）
- Search Console：
  - Coverage 报错减少（重复、规范化、软 404）
