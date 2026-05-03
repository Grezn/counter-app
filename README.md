# counter-app

這是一個練習用的 Docker + AWS 部署專案：

GitHub push -> GitHub Actions build image -> ECR -> ASG instance refresh -> EC2 用 Docker 啟動服務

## 主要元件

- `server.js`：Express 伺服器入口。
- `routes/counter.js`：計數器、訪客統計、Reset API。
- `routes/health.js`：健康檢查 API。
- `services/redis.js`：Redis/ElastiCache 連線設定。
- `public/index.html`：前端 Dashboard。
- `.github/workflows/deploy.yml`：CI/CD，自動 build/push image 並刷新 ASG。
- `infra/envs/prod`：AWS ALB / Target Group / ASG 的 Terraform 設定。

## 環境變數

請用 `.env.example` 當範本，但不要把真正的 `.env` commit 到 GitHub。

- `IMAGE_URI`：ECR image，例如 `123456789012.dkr.ecr.us-east-1.amazonaws.com/docker-demo:latest`
- `APP_VERSION`：顯示在 `/whoami` 的版本字串。
- `REDIS_URL`：完整 Redis URL，優先使用這個。
- `REDIS_HOST` / `REDIS_PORT`：如果沒有設定 `REDIS_URL`，程式會用這兩個組成 Redis URL。
- `RESET_TOKEN`：Reset 按鈕需要的 token，正式環境請放在 SSM Parameter Store 或 Secrets Manager。

## 部署注意事項

- Docker image 會透過 `.dockerignore` 排除 `.env`、Git 資料、Terraform state 和重複的 `app/` 目錄。
- `/health` 只代表 Node.js 還活著。
- `/ready` 會檢查 Redis，因此 ALB / Docker health check 使用 `/ready` 比較適合正式部署。
- GitHub Actions 會等待 ASG instance refresh 結果，避免「CI 顯示成功，但 EC2 換機其實失敗」。
- EC2 user data 範本放在 `infra/user-data.sh`。正式環境建議讓 EC2 掛 IAM Role，不要在機器上放 IAM User access key。
- ALB 來源 IP 限制腳本放在 `infra/restrict-alb-source-ip.sh`。
- GitHub Actions OIDC 建立腳本放在 `infra/setup-github-oidc.sh`。
- 程式碼導讀請看 `docs/code-walkthrough.md`。
- 詳細維運步驟和 key 移除說明請看 `docs/operations.md`。

## Reset 按鈕

前端不會寫死 reset token。第一次按 Reset 時，瀏覽器會要求輸入 `RESET_TOKEN`，並暫存在這次分頁的 `sessionStorage`。

## EC2 權限

EC2 開機執行 user data 時，`aws ecr get-login-password` 需要 AWS 權限。建議用 EC2 Instance Profile / IAM Role，最少需要：

- ECR 讀取 image：`ecr:GetAuthorizationToken`、`ecr:BatchCheckLayerAvailability`、`ecr:GetDownloadUrlForLayer`、`ecr:BatchGetImage`
- 如果 Reset Token 放 SSM：`ssm:GetParameter`
- 如果 SSM SecureString 用自訂 KMS key：`kms:Decrypt`

GitHub Actions 目前用 IAM User access key 也能部署；之後要再加強時，可以改成 GitHub OIDC assume role，避免長期 access key 放在 GitHub secrets。
