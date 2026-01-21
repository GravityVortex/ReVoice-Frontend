# Logo和品牌更新方案

## 需求总结
1. **图片格式**：使用透明PNG格式（已提供 `logo.png` 和 `big.png`）
2. **Logo简化**：左上角只保留图标，移除文字，放大图标
3. **统一Logo**：不再区分黑白主题，统一使用一套图片
4. **品牌名称替换**：全局将 `ReVoice` 替换为 `SoulDub`

---

## 实施步骤

### 1. BrandLogo 组件
**文件**: `src/shared/blocks/common/brand-logo.tsx`

修改内容：
- 移除 `useTheme` 主题切换逻辑
- 固定使用 `/logo.png`
- 放大图标：`h-10` → `h-14`
- 移除 `brand.title` 文字显示

### 2. Hero 组件
**文件**: `src/themes/default/blocks/hero.tsx`

修改内容：
- 移除 `useTheme` 主题切换逻辑
- 固定使用 `/big.png`

### 3. 全局替换 ReVoice → SoulDub

需修改的文件及位置：
- `src/config/locale/messages/en/landing.json` (29处)
- `src/config/locale/messages/en/pricing.json` (2处)
- `src/config/locale/messages/zh/landing.json` (2处)
- `src/config/locale/messages/en/admin/sidebar.json` (2处)

同时替换邮箱：
- `support@revoice.com` → `support@souldub.com`

---

## 图片资源

| 文件 | 用途 | 位置 |
|------|------|------|
| `logo.png` | 左上角导航栏图标 | `/public/logo.png` |
| `big.png` | 首页大logo（标题上方） | `/public/big.png` |

---

## 状态
- [x] BrandLogo 组件修改
- [x] Hero 组件修改
- [x] 全局替换 ReVoice → SoulDub
