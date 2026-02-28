# GitHub + Vercel 自动化部署

本项目已内置 GitHub Actions 工作流：`.github/workflows/ci-cd.yml`。

## 触发规则
- Push 到 `main` / `develop`：执行前后端构建检查。
- Pull Request 到 `main`：执行前后端构建检查。
- Push 到 `main` 且已配置 Vercel secrets：自动部署到 Vercel 生产环境。

## 需要配置的 GitHub Secrets
在 GitHub 仓库页面 `Settings -> Secrets and variables -> Actions` 中新增：

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

> 这些值可通过本地执行 `vercel link` 后在 `.vercel/project.json` 获取（`orgId` 和 `projectId`），`VERCEL_TOKEN` 在 Vercel 账号设置中创建。

## 首次绑定（本地执行一次）
```bash
npm i -g vercel
vercel login
vercel link
```

## 推送到 GitHub 并触发自动部署
```bash
git push origin main
```

推送完成后可在：
- GitHub Actions 页面查看流水线
- Vercel Dashboard 查看生产部署记录
