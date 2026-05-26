# counter-app

這是一個練習用的 Docker + AWS 部署專案：

GitHub push -> GitHub Actions build image -> ECR -> SSM 更新現有 EC2 container；SSM 不可用時部署失敗並保留舊版，不自動替換 EC2

## 主要元件

- `server.js`：Express 伺服器入口。
- `routes/counter.js`：計數器、訪客統計、Reset API。
- `routes/health.js`：健康檢查 API。
- `routes/jira.js`：Jira Cloud issue 建立 API，負責保護 API token 並代送事件摘要。
- `routes/runbooks.js`：SOP / Runbook API，從後端 JSON 讀資料給前端顯示。
- `services/redis.js`：Redis/ElastiCache 連線設定。
- `data/runbooks.json`：值班 SOP / Runbook 資料，只放可顯示在前端的處理骨架。
- `public/index.html`：前端 Dashboard。
- `.github/workflows/deploy.yml`：CI/CD，自動 build/push image，並用 SSM 在既有 EC2 就地更新 container。
- `infra/envs/prod`：AWS ALB / Target Group / ASG 的 Terraform 設定。

## 環境變數

請用 `.env.example` 當範本，但不要把真正的 `.env` commit 到 GitHub。

- `IMAGE_URI`：ECR image，例如 `123456789012.dkr.ecr.us-east-1.amazonaws.com/docker-demo:latest`
- `APP_VERSION`：顯示在 `/whoami` 的版本字串。
- `APP_BASIC_AUTH_USER` / `APP_ACCESS_TOKEN`：保護整個值班中控台的 Basic Auth 帳號與 token；`APP_ACCESS_TOKEN` 留空時會 fallback 到 `RESET_TOKEN`。
- `TRUST_PROXY_HOPS`：Express 信任的上游 proxy hop 數；ALB 直連 app 時維持 `1`。
- `REDIS_URL`：完整 Redis URL，優先使用這個。
- `REDIS_HOST` / `REDIS_PORT`：如果沒有設定 `REDIS_URL`，程式會用這兩個組成 Redis URL。
- `REDIS_CONNECT_TIMEOUT_MS` / `REDIS_CONNECT_MAX_RETRIES` / `REDIS_RECONNECT_DELAY_MS`：Redis 單次連線嘗試的逾時、重試上限與背景重連間隔；超過後網站仍會啟動，`/ready` 會回失敗並持續重連。
- `RESET_TOKEN`：Reset 按鈕需要的 token，正式環境請放在 SSM Parameter Store 或 Secrets Manager。
- `JIRA_BASE_URL`：Jira Cloud 網站，例如 `https://your-domain.atlassian.net`。
- `JIRA_REST_BASE_URL`：可選；若使用 scoped API token，可填 `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3`。
- `JIRA_EMAIL` / `JIRA_API_TOKEN`：建立小卡用的 Atlassian 帳號 email 與 API token。
- `JIRA_PROJECT_KEY`：要建立 issue 的 Jira project key，例如 `PMP`。
- `JIRA_ISSUE_TYPE` / `JIRA_ISSUE_TYPE_ID`：issue type，預設使用 `交接事項`；若你的 Jira create screen 需要固定 ID，可填 `JIRA_ISSUE_TYPE_ID`。
- `JIRA_LABELS`：建立小卡時加上的 labels，逗號分隔，預設 `電話連絡,noc-oncall`。
- `JIRA_DEFAULT_PRIORITY`：可選；若留空會依嚴重度帶入 High / Medium / Low。
- `CWA_API_KEY`：中央氣象署氣象資料開放平台授權碼，只放後端環境變數或 SSM。
- `CWA_LOCATION_NAME` / `CWA_CITY_DATASET_ID` / `CWA_TOWNSHIP_DATASET_ID` / `CWA_OBSERVATION_DATASET_ID` / `CWA_CACHE_TTL_MS`：本地即時氣象顯示設定；使用者允許定位時會找最近觀測站並搭配鄉鎮預報，否則退回預設地區。

正式環境可額外建立獨立的中控台登入 token；沒建立時會先沿用既有的 reset token：

```bash
aws ssm put-parameter --region us-east-1 --name /counter-app/prod/app-access-token --type SecureString --value "你的長隨機token" --overwrite
```

## 氣象 API 授權碼

不要把中央氣象署授權碼 commit 到 repo。正式環境可放到既有 user data 會讀取的 SSM SecureString：

本地即時氣象會先用瀏覽器 Geolocation 取得使用者位置，再由後端查中央氣象署最近觀測站與鄉鎮預報；若使用者拒絕定位，或正式網站還不是 HTTPS，會退回 `CWA_LOCATION_NAME` 的預設地區資料。

```bash
aws ssm put-parameter --region us-east-1 --name /counter-app/prod/cwa-api-key --type SecureString --value "你的授權碼" --overwrite
```

如果畫面顯示「部署環境未讀到氣象授權碼」，代表 container 裡的 `CWA_API_KEY` 是空的。請在 CloudShell 補一次 EC2 Instance Profile 權限：

```bash
bash infra/setup-ec2-ssm-parameters.sh
```

## 部署注意事項

- Docker image 會透過 `.dockerignore` 排除 `.env`、Git 資料和 Terraform state。
- `/health` 只代表 Node.js 還活著。
- `/ready` 會檢查 Redis，因此 ALB / Docker health check 使用 `/ready` 比較適合正式部署。
- GitHub Actions 會先用 SSM 在現有 EC2 上 `docker pull` SHA image，啟動 candidate container 通過 `/ready` 後才切換正式 container。
- ASG instance refresh fallback 預設關閉，避免一般 push 造成 EC2 替換。若臨時要允許換機，請在 workflow 把 `ALLOW_ASG_REFRESH_FALLBACK` 改成 `"true"`。
- EC2 user data 範本放在 `infra/user-data.sh`。正式環境建議讓 EC2 掛 IAM Role，不要在機器上放 IAM User access key。
- 如果手動 ASG refresh 後沒有讀到新環境變數，請用 `infra/update-asg-user-data.sh` 把 repo 裡的 user data 更新到 Launch Template。
- Jira email / API token 的 SSM 參數名稱預設為 `/counter-app/prod/jira-email` 和 `/counter-app/prod/jira-api-token`。
- ALB 來源 IP 限制腳本放在 `infra/restrict-alb-source-ip.sh`。
- GitHub Actions OIDC 建立腳本放在 `infra/setup-github-oidc.sh`。
- EC2 讀取 `/counter-app/prod/*` SSM 參數的權限腳本放在 `infra/setup-ec2-ssm-parameters.sh`。
- 專案資源、網路與應用總整理請看 `docs/project-inventory.md`。
- 程式碼導讀請看 `docs/code-walkthrough.md`。
- 詳細維運步驟和 key 移除說明請看 `docs/operations.md`。

## 快速部署模式

push 到 `main` 後，workflow 現在會先找 ASG 裡健康中的 EC2，透過 AWS Systems Manager Run Command 直接在原機器執行 `docker pull`。workflow 會額外印出 SSM Online 狀態做診斷，但不再因為預檢查不到 Online 就跳過部署。

新版 image 會先用 candidate container 跑在 `127.0.0.1:18080`，確認 `/ready` 正常後才停止舊的 `counter-app` container，並用新版重開 port 80。這樣不用等新 EC2 開機；正式切換通常只剩 container stop/start 的短暫空窗。

若 SSM 權限、SSM Agent 或 instance 狀態不符合，workflow 會失敗並保留舊版線上服務，不會自動換 EC2。請先在 CloudShell 進入 repo 後補權限，再 re-run workflow：

```bash
cd ~
git clone https://github.com/Grezn/counter-app.git || true
cd counter-app
git pull --ff-only
bash infra/setup-github-oidc.sh
bash infra/setup-ec2-ssm-parameters.sh
```

第一次啟用快路徑前，重點是重新套 GitHub OIDC deploy role 權限，並補齊 EC2 Instance Profile 的 SSM 權限：

```bash
bash infra/setup-github-oidc.sh
bash infra/setup-ec2-ssm-parameters.sh
```

EC2 的 Instance Profile 也要能被 SSM 管理，通常需要 AWS managed policy `AmazonSSMManagedInstanceCore`，另外仍需要 ECR pull、SSM Parameter Store 讀取與必要時的 `kms:Decrypt`。

## Reset 按鈕

前端不會寫死 reset token。第一次按 Reset 時，瀏覽器會要求輸入 `RESET_TOKEN`，並暫存在這次分頁的 `sessionStorage`。

## Jira 小卡

前端的「建立 Jira 小卡」會把目前事件表單和交班摘要送到後端 `/api/jira/issues`，再由後端呼叫 Jira Cloud REST API 建立 issue。Jira token 不會出現在 HTML、JS 或瀏覽器 localStorage；正式環境請把 token 放在 EC2 env、SSM Parameter Store 或 Secrets Manager。

如果 API token 曾經貼到聊天、文件或前端程式碼，請先到 Atlassian 帳號撤銷舊 token，再建立新 token 填入後端環境變數。

## EC2 權限

EC2 開機執行 user data 時，`aws ecr get-login-password` 需要 AWS 權限。建議用 EC2 Instance Profile / IAM Role，最少需要：

- ECR 讀取 image：`ecr:GetAuthorizationToken`、`ecr:BatchCheckLayerAvailability`、`ecr:GetDownloadUrlForLayer`、`ecr:BatchGetImage`
- SSM 管理 EC2：建議掛 `AmazonSSMManagedInstanceCore`
- 如果 Reset Token 放 SSM：`ssm:GetParameter`
- 如果 Jira API token 放 SSM：`ssm:GetParameter`
- 如果 CWA API key 放 SSM：`ssm:GetParameter`
- 如果 SSM SecureString 用自訂 KMS key：`kms:Decrypt`

GitHub Actions 目前使用 GitHub OIDC assume role 部署，避免長期 AWS access key 放在 GitHub secrets。
