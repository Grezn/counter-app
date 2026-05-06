# counter-app

這是一個練習用的 Docker + AWS 部署專案：

GitHub push -> GitHub Actions build image -> ECR -> ASG instance refresh -> EC2 用 Docker 啟動服務

## 主要元件

- `server.js`：Express 伺服器入口。
- `routes/counter.js`：計數器、訪客統計、Reset API。
- `routes/health.js`：健康檢查 API。
- `routes/jira.js`：Jira Cloud issue 建立 API，負責保護 API token 並代送事件摘要。
- `routes/runbooks.js`：SOP / Runbook API，從後端 JSON 讀資料給前端顯示。
- `services/redis.js`：Redis/ElastiCache 連線設定。
- `data/runbooks.json`：值班 SOP / Runbook 資料，只放可顯示在前端的處理骨架。
- `public/index.html`：前端 Dashboard。
- `.github/workflows/deploy.yml`：CI/CD，自動 build/push image 並刷新 ASG。
- `infra/envs/prod`：AWS ALB / Target Group / ASG 的 Terraform 設定。

## 環境變數

請用 `.env.example` 當範本，但不要把真正的 `.env` commit 到 GitHub。

- `IMAGE_URI`：ECR image，例如 `123456789012.dkr.ecr.us-east-1.amazonaws.com/docker-demo:latest`
- `APP_VERSION`：顯示在 `/whoami` 的版本字串。
- `REDIS_URL`：完整 Redis URL，優先使用這個。
- `REDIS_HOST` / `REDIS_PORT`：如果沒有設定 `REDIS_URL`，程式會用這兩個組成 Redis URL。
- `REDIS_CONNECT_TIMEOUT_MS` / `REDIS_CONNECT_MAX_RETRIES`：Redis 開機連線逾時與重試上限；超過後網站仍會啟動，`/ready` 會回失敗。
- `RESET_TOKEN`：Reset 按鈕需要的 token，正式環境請放在 SSM Parameter Store 或 Secrets Manager。
- `ONCALL_LINKS_ADMIN_TOKEN`：可選；值班入口線上編輯 token。留空時會沿用 `RESET_TOKEN`。
- `ONCALL_LINKS_REDIS_KEY`：可選；值班入口存在 Redis 的 key，預設 `config:oncall_links`。
- `JIRA_BASE_URL`：Jira Cloud 網站，例如 `https://your-domain.atlassian.net`。
- `JIRA_REST_BASE_URL`：可選；若使用 scoped API token，可填 `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3`。
- `JIRA_EMAIL` / `JIRA_API_TOKEN`：建立小卡用的 Atlassian 帳號 email 與 API token。
- `JIRA_PROJECT_KEY`：要建立 issue 的 Jira project key，例如 `PMP`。
- `JIRA_ISSUE_TYPE` / `JIRA_ISSUE_TYPE_ID`：issue type，預設使用 `交接事項`；若你的 Jira create screen 需要固定 ID，可填 `JIRA_ISSUE_TYPE_ID`。
- `JIRA_LABELS`：建立小卡時加上的 labels，逗號分隔，預設 `電話連絡,noc-oncall`。
- `JIRA_DEFAULT_PRIORITY`：可選；若留空會依嚴重度帶入 High / Medium / Low。
- `CWA_API_KEY`：中央氣象署氣象資料開放平台授權碼，只放後端環境變數或 SSM。
- `CWA_LOCATION_NAME` / `CWA_DATASET_ID` / `CWA_CACHE_TTL_MS`：本地區氣象顯示設定。

## 值班入口線上更新

「值班入口」已改成資料驅動。預設資料在 `data/oncall-links.json`；正式環境若 Redis 可用，按右側「值班入口」裡的「編輯入口」即可用 JSON 更新連結，儲存後會寫到 Redis，不需要 push、不需要 ASG instance refresh。

線上編輯使用 `ONCALL_LINKS_ADMIN_TOKEN`，未設定時沿用 `RESET_TOKEN`。這適合更新入口連結、群組和 checklist；如果是改程式碼、版面功能或後端邏輯，仍然要走 Docker image 部署。

## 氣象 API 授權碼

不要把中央氣象署授權碼 commit 到 repo。正式環境可放到既有 user data 會讀取的 SSM SecureString：

```bash
aws ssm put-parameter --region us-east-1 --name /counter-app/prod/cwa-api-key --type SecureString --value "你的授權碼" --overwrite
```

## 部署注意事項

- Docker image 會透過 `.dockerignore` 排除 `.env`、Git 資料、Terraform state 和重複的 `app/` 目錄。
- `/health` 只代表 Node.js 還活著。
- `/ready` 會檢查 Redis，因此 ALB / Docker health check 使用 `/ready` 比較適合正式部署。
- GitHub Actions 會等待 ASG instance refresh 結果，避免「CI 顯示成功，但 EC2 換機其實失敗」。
- EC2 user data 範本放在 `infra/user-data.sh`。正式環境建議讓 EC2 掛 IAM Role，不要在機器上放 IAM User access key。
- Jira email / API token 的 SSM 參數名稱預設為 `/counter-app/prod/jira-email` 和 `/counter-app/prod/jira-api-token`。
- ALB 來源 IP 限制腳本放在 `infra/restrict-alb-source-ip.sh`。
- GitHub Actions OIDC 建立腳本放在 `infra/setup-github-oidc.sh`。
- 程式碼導讀請看 `docs/code-walkthrough.md`。
- 詳細維運步驟和 key 移除說明請看 `docs/operations.md`。

## Reset 按鈕

前端不會寫死 reset token。第一次按 Reset 時，瀏覽器會要求輸入 `RESET_TOKEN`，並暫存在這次分頁的 `sessionStorage`。

## Jira 小卡

前端的「建立 Jira 小卡」會把目前事件表單和交班摘要送到後端 `/api/jira/issues`，再由後端呼叫 Jira Cloud REST API 建立 issue。Jira token 不會出現在 HTML、JS 或瀏覽器 localStorage；正式環境請把 token 放在 EC2 env、SSM Parameter Store 或 Secrets Manager。

如果 API token 曾經貼到聊天、文件或前端程式碼，請先到 Atlassian 帳號撤銷舊 token，再建立新 token 填入後端環境變數。

## EC2 權限

EC2 開機執行 user data 時，`aws ecr get-login-password` 需要 AWS 權限。建議用 EC2 Instance Profile / IAM Role，最少需要：

- ECR 讀取 image：`ecr:GetAuthorizationToken`、`ecr:BatchCheckLayerAvailability`、`ecr:GetDownloadUrlForLayer`、`ecr:BatchGetImage`
- 如果 Reset Token 放 SSM：`ssm:GetParameter`
- 如果 Jira API token 放 SSM：`ssm:GetParameter`
- 如果 SSM SecureString 用自訂 KMS key：`kms:Decrypt`

GitHub Actions 目前用 IAM User access key 也能部署；之後要再加強時，可以改成 GitHub OIDC assume role，避免長期 access key 放在 GitHub secrets。
