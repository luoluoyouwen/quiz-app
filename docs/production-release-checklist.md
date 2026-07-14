# 刷题 App 5.0 生产发布清单

> 目标版本：5.0.0
> 状态：预备部署生产
> 更新时间：2026-07-13

## 1. 发布原则

- 先验证 Preview，再部署 `master`。
- 不在生产发布过程中修改数据库结构或业务代码。
- 生产构建必须来自已验证的同一工作区状态。
- 不在命令、截图、文档或聊天中暴露 Token 和服务角色密钥。
- 发布前记录当前生产部署，确保可以回滚。

## 2. 必须完成的安全事项

- [ ] 轮换曾出现在旧文档中的 Cloudflare API Token。
- [ ] 将新 Token 写入本机 `.env.cf`，确认该文件仍被 `.gitignore` 排除。
- [ ] 确认仓库和待提交差异中不存在真实 `cfat_`、`sk-` 或服务角色密钥。
- [ ] 确认 Cloudflare Pages Secrets 已配置：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SERVICE_ROLE_KEY`、`AI_NORMALIZE_API_KEY`。
- [ ] 在 Supabase Dashboard 开启泄露密码保护。
- [ ] 确认最终 RLS、函数权限和性能加固 SQL 已应用。
- [ ] 备份数据库或确认可用的恢复点。

密钥扫描：

```powershell
rg -n --hidden "cfat_[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}" . -g "!node_modules/**" -g "!dist/**" -g "!.git/**" -g "!.env*"
```

扫描结果中的类型声明和测试占位值可人工确认，真实凭据必须为零。

## 3. 版本一致性

- [ ] `package.json` 为 `5.0.0`。
- [ ] `package-lock.json` 根版本为 `5.0.0`。
- [ ] `src/utils/changelog.ts` 的 `APP_VERSION` 为 `5.0.0`。
- [ ] 应用内更新日志首条为 5.0.0。
- [ ] README、使用帮助、开发文档和交付文档均标记 5.0.0。
- [ ] 生产发布后补充实际部署时间和部署 ID。

## 4. 数据库核对

已部署环境应包含：

- `profiles`
- `question_banks`
- `questions`
- `user_progress`
- `practice_sessions`
- `page_views`
- `audit_logs`
- `announcements`
- `announcement_reads`
- `feedback_items`

最终迁移文件：

1. `supabase/final-security-hardening.sql`
2. `supabase/final-function-access.sql`
3. `supabase/final-performance-hardening.sql`

检查重点：

- 普通用户不能读取其他用户 profile。
- 普通用户不能批准自己的题库或提升角色。
- 普通用户不能访问 `/api/admin/*`。
- 用户只能读写自己的进度、反馈和公告已读记录。
- 管理员 API 必须重新验证 bearer token 和 admin 角色。
- questions 到 question_banks 的删除行为为数据库级联。
- SECURITY DEFINER 函数只有必要角色拥有执行权限。

## 5. 自动化门禁

在 PowerShell 7 执行：

```powershell
npx tsc -b --pretty false
npx eslint . --quiet
npm test -- --run
npm audit --omit=dev --registry=https://registry.npmjs.org
npm run build
git diff --check
```

通过标准：

- TypeScript 0 errors。
- ESLint 0 errors。
- 测试无失败。
- 生产依赖 0 vulnerabilities。
- 构建成功并生成 `dist/`。
- `git diff --check` 无空白错误。

完整 ESLint warnings 作为技术债记录，不作为 5.0.0 阻断项，但不能新增 error。

## 6. Preview 部署

```powershell
$line = Get-Content .env.cf | Where-Object { $_ -match 'CLOUDFLARE_API_TOKEN' } | Select-Object -First 1
$env:CLOUDFLARE_API_TOKEN = ($line -replace '^\s*(?:export\s+)?CLOUDFLARE_API_TOKEN\s*=\s*["'']?', '' -replace '["'']?\s*$', '')
npx wrangler pages deploy dist --project-name $env:CLOUDFLARE_PAGES_PROJECT --branch preview
```

记录：

- Preview alias：
- 唯一部署 URL：
- Wrangler 版本：
- 部署时间：

## 7. Preview 冒烟测试

### 未登录

- [ ] 登录页和初始加载界面正常。
- [ ] 深色模式文字可读。
- [ ] 未登录访问管理员 API 返回 401。
- [ ] 不存在旧 `/api/admin/reset-password` 路由。

### 普通用户

- [ ] 登录、退出和会话恢复正常。
- [ ] 首页题库数和总题数正确。
- [ ] 本地题库与云端题库可进入。
- [ ] 缓存云端题库后可断网打开。
- [ ] 选择、判断、填空、简答和背题流程正常。
- [ ] 已掌握和需复习状态正确变化。
- [ ] 题号弹窗打开后背景不可滚动。
- [ ] 统计页只显示当前账号数据。
- [ ] 公告只提醒一次，公告中心仍可查看。
- [ ] 反馈可提交，未回复反馈可删除。
- [ ] 拍照搜题可加载 OCR、编辑识别文本并搜索。
- [ ] 手机底部导航和返回逻辑正常。

### 管理员

- [ ] 系统概览数据可读取。
- [ ] 题库审核、改名、删除和操作日志正常。
- [ ] 用户创建、角色修改、密码重置和删除正常。
- [ ] 管理员不能误降级自己的账号。
- [ ] 公告可创建、定时、发布、修改和删除。
- [ ] 反馈可回复、撤回回复、关闭和删除。
- [ ] 深色模式下后台无浅色方框和不可读文字。

### 浏览器与布局

- [ ] 桌面端 1440px 无横向溢出。
- [ ] Android 412px 无横向溢出。
- [ ] 顶栏、底栏、胶囊和弹窗无重叠。
- [ ] 页面切换不会继承其他主栏目的滚动位置。
- [ ] 生产控制台无 error 和业务 warning。

## 8. 生产部署

仅在 Preview 验证通过并得到明确确认后执行：

```powershell
npm run build
npx wrangler pages deploy dist --project-name $env:CLOUDFLARE_PAGES_PROJECT --branch master
```

部署后记录：

- Production URL：
- 唯一部署 URL：
- 部署时间：
- 验证人：

## 9. 生产发布后检查

- [ ] 从受控部署环境读取的生产地址返回 200。
- [ ] 新登录会话显示 v5.0.0。
- [ ] 已安装 PWA 能收到更新提示并切换到 5.0.0。
- [ ] Cloudflare Functions 无持续 5xx。
- [ ] Supabase Auth、Database 和 API 指标无异常。
- [ ] 公告、反馈和进度写入没有权限错误。
- [ ] 保留 Preview 候选至少一个发布周期，便于对照。

## 10. 回滚

发现阻断问题时：

1. 暂停继续发布和数据库变更。
2. 在 Cloudflare Dashboard 重新部署上一个已验证的生产版本，或重新部署其已保存构建。
3. 如果问题涉及数据库，只执行事先准备并验证过的回滚 SQL。
4. 通知用户暂缓刷新，记录受影响时间和功能。
5. 修复后重新从 Preview 门禁开始，不直接覆盖生产。

PWA 回滚仍受 Service Worker 缓存影响，回滚后必须验证新旧客户端都能重新获得正确 HTML 和更新提示。
