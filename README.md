# counter-app

這是一個練習用的 Docker + AWS 部署專案：

GitHub push -> GitHub Actions build image -> ECR -> SSM 更新現有 EC2 container；SSM 不可用時部署失敗並保留舊版，不自動替換 EC2

## 主要元件

- `server.js`：Express 伺服器入口。
- `frontend/`：Vue + Vite 前端專案；`src/components/` 放中控台頁首、本地氣象、訪客統計、事件標題/操作工具列、事件欄位/快速接案/事件樣板/常用句/處理紀錄時間軸/Jira 狀態/交班提醒/摘要徽章/摘要文字/摘要狀態、事件 checklist、交班摘要面板、事件歷史狀態/事件歷史焦點列/事件歷史列表/重複事件提示/報修補充欄位/工作流/歷史紀錄、SOP 速查、值班入口與回頂部按鈕，`src/composables/` 放畫面狀態、事件核心欄位、事件 checklist 狀態與 `useWindowBridge.js`（所有 `__msp*` window bridge 註冊集中在這裡），`src/api/` 集中前端對 Express API 的 JSON 呼叫，build 後輸出到 `frontend/dist`。
- `routes/counter.js`：訪客統計 API；新前端走 `/api/visitor-stats/*`，舊 `/track-view`、`/stats`、`/heartbeat` 保留相容，Redis 不可用時暫用 process memory。
- `routes/incidents.js`：事件紀錄 API controller；Redis 不可用時暫用 process memory，前端仍會保留 localStorage fallback。
- `routes/health.js`：健康檢查 API。
- `routes/jira.js`：Jira Cloud API controller，負責接收狀態查詢與建卡請求。
- `routes/runbooks.js`：SOP / Runbook API controller，從後端 service 取得資料給前端顯示。
- `routes/weather.js`：本地即時氣象 API controller，負責回傳 weather service 結果。
- `services/incidents.js`：事件紀錄 service，集中資料清洗、Redis hash/sorted set、legacy list migration、memory fallback 與結案/刪除狀態轉換。
- `services/jira.js`：Jira service，集中 Jira 設定檢查、ADF payload 組裝、priority/label 推導與 Atlassian REST 呼叫。
- `services/runbooks.js`：Runbook service，集中 `data/runbooks.json` 載入、搜尋、分類過濾與 MCP 摘要格式。
- `services/visitorStats.js`：訪客統計 service，集中 Redis key、memory fallback、visitor id 與 active visitors 邏輯。
- `services/weather.js`：本地氣象 service，集中 CWA/Open-Meteo 呼叫、快取、觀測站解析、預報與 local degraded response。
- `services/redis.js`：Redis/ElastiCache 連線設定。
- `data/runbooks.json`：值班 SOP / Runbook 資料，只放可顯示在前端的處理骨架。
- `public/index.html`：Vue build 尚未產出時的建置提示 fallback；正式首頁由 `frontend/dist/index.html` 回應。
- `public/app.js` / `public/handover-summary.js`：Vue shell 載入後接上的事件紀錄、交班摘要計算、快速接案套用、Jira 草稿副作用、事件樣板套用、事件儲存狀態與 SOP 帶入事件草稿橋接；Jira / visitor stats / incidents CRUD API 已由 Vue API client 管理，事件時間/客戶/系統/主旨/問題描述/影響範圍/接手人員/下一步/已通知/嚴重度/目前狀態/來源欄位、快速接案文字、處理紀錄 textarea 與時間軸、追蹤狀態 select 與下次確認欄位狀態、摘要文字、摘要格式、事件樣板選取、事件歷史 view 與儲存按鈕狀態已由 Vue 顯示；事件 snapshot、草稿 localStorage、狀態套用、欄位/radio/follow-up 補值與文字追加會優先走 `__mspIncidentState`，目前編輯中的事件紀錄 ID、已儲存 snapshot 與儲存按鈕狀態優先走 `__mspIncidentSaveStatus`，DOM 掃描保留為 fallback，`public/app.js` 不再直接 `fetch`。
- `.github/workflows/deploy.yml`：CI/CD，自動 build/push image，並用 SSM 在既有 EC2 就地更新 container。
- `infra/envs/prod`：AWS ALB / Target Group / ASG 的 Terraform 設定。

## 環境變數

請用 `.env.example` 當範本，但不要把真正的 `.env` commit 到 GitHub。

- `IMAGE_URI`：ECR image，例如 `123456789012.dkr.ecr.us-east-1.amazonaws.com/docker-demo:latest`
- `APP_VERSION`：顯示在 `/whoami` 的版本字串。
- `TRUST_PROXY_HOPS`：Express 信任的上游 proxy hop 數；ALB 直連 app 時維持 `1`。
- `REDIS_URL`：完整 Redis URL，優先使用這個。
- `REDIS_HOST` / `REDIS_PORT`：如果沒有設定 `REDIS_URL`，程式會用這兩個組成 Redis URL。
- `REDIS_CONNECT_TIMEOUT_MS` / `REDIS_CONNECT_MAX_RETRIES` / `REDIS_RECONNECT_DELAY_MS`：Redis 單次連線嘗試的逾時、重試上限與背景重連間隔；超過後網站仍會啟動，`/ready` 會回 ready/degraded，統計與事件 API 暫時使用 process memory 並持續重連。
- `JIRA_BASE_URL`：Jira Cloud 網站，例如 `https://your-domain.atlassian.net`。
- `JIRA_REST_BASE_URL`：可選；若使用 scoped API token，可填 `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3`。
- `JIRA_EMAIL` / `JIRA_API_TOKEN`：建立小卡用的 Atlassian 帳號 email 與 API token。
- `JIRA_PROJECT_KEY`：要建立 issue 的 Jira project key，例如 `PMP`。
- `JIRA_ISSUE_TYPE` / `JIRA_ISSUE_TYPE_ID`：issue type，預設使用 `交接事項`；若你的 Jira create screen 需要固定 ID，可填 `JIRA_ISSUE_TYPE_ID`。
- `JIRA_LABELS`：建立小卡時加上的 labels，逗號分隔，預設 `電話連絡,noc-oncall`。
- `JIRA_DEFAULT_PRIORITY`：可選；若留空會依嚴重度帶入 High / Medium / Low。
- `CWA_API_KEY`：中央氣象署氣象資料開放平台授權碼，只放後端環境變數或 SSM；未設定時會先用免金鑰備援氣象來源顯示基本天氣，備援來源也不可用時會回 local degraded 氣象資料結構，避免前端空白。
- `CWA_LOCATION_NAME` / `CWA_CITY_DATASET_ID` / `CWA_TOWNSHIP_DATASET_ID` / `CWA_OBSERVATION_DATASET_ID` / `CWA_CACHE_TTL_MS`：本地即時氣象顯示設定；使用者允許定位時會找最近觀測站並搭配鄉鎮預報，否則退回預設地區。

## MCP + Skills

目前版本已加入專案用 MCP stdio server 與 project skill：

- `mcp/server.mjs`：提供 `app_status`、`search_runbooks`、`get_runbook`、`list_incidents`、`save_incident`、`get_weather_snapshot` 工具。
- `counter-app://docs/readme`、`counter-app://docs/operations`、`counter-app://docs/code-walkthrough`、`counter-app://docs/project-inventory`、`counter-app://data/runbooks`、`counter-app://mcp/config-example` 是 MCP resources。
- `draft_handover` 與 `develop_dashboard_change` 是 MCP prompts。
- `.mcp.example.json` 是本機 MCP client 設定範例。
- `skills/counter-app/SKILL.md` 是此 repo 的開發/維運 skill。

本機驗證：

```bash
npm run verify
```

如果只想分段跑：

```bash
npm run build
npm run weather:smoke
npm run incidents:smoke
npm run api:smoke
npm run mcp:smoke
```

本機開發前端可用 `npm run dev:frontend` 啟動 Vite；它會把 API 請求 proxy 到 `http://127.0.0.1:3000`，所以 Express 後端仍需另外啟動。
`npm run api:smoke` 會優先使用 `API_SMOKE_BASE_URL`、`COUNTER_APP_BASE_URL` 或 `http://127.0.0.1:3000`；如果本機 app 沒有啟動，會自動開一個暫時的本機 server 跑 smoke 後關閉。若 base URL 指到非 localhost，事件寫入測試會預設跳過，避免誤寫正式環境。

啟動 MCP server：

```bash
npm run mcp
```

MCP 預設透過 `COUNTER_APP_BASE_URL` 連到 `http://127.0.0.1:3000`。讀取 docs / runbooks 不需要 app 正在執行；查 incidents、weather、health 或 Jira status 時需要先啟動 Express app。

`save_incident` 預設 `dryRun=true`，且即使傳入 `dryRun=false` 也需要設定 `MCP_ALLOW_WRITES=1` 才會真的寫入事件紀錄，避免 MCP client 誤指到正式環境時產生資料。

## 氣象 API 授權碼

不要把中央氣象署授權碼 commit 到 repo。正式環境可放到既有 user data 會讀取的 SSM SecureString：

本地即時氣象會先用瀏覽器 Geolocation 取得使用者位置，再由後端查中央氣象署最近觀測站與鄉鎮預報；若使用者拒絕定位，或正式網站還不是 HTTPS，會退回 `CWA_LOCATION_NAME` 的預設地區資料。

```bash
aws ssm put-parameter --region us-east-1 --name /counter-app/prod/cwa-api-key --type SecureString --value "你的授權碼" --overwrite
```

如果畫面顯示備援氣象來源，代表 container 裡的 `CWA_API_KEY` 是空的。畫面仍會顯示基本天氣；若要使用中央氣象署資料，請在 CloudShell 補一次 EC2 Instance Profile 權限：

```bash
bash infra/setup-ec2-ssm-parameters.sh
```

## 部署注意事項

- Docker image 會透過 `.dockerignore` 排除 `.env`、Git 資料和 Terraform state。
- `/health` 只代表 Node.js 還活著。
- `/ready` 會回報 Redis 狀態，但 Redis 不可用時仍讓 app 保持 ready，避免統計或事件暫存拖垮整個值班台。
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

## Jira 小卡

前端的「建立 Jira 小卡」會把目前事件表單和交班摘要送到後端 `/api/jira/issues`，再由後端呼叫 Jira Cloud REST API 建立 issue。Jira token 不會出現在 HTML、JS 或瀏覽器 localStorage；正式環境請把 token 放在 EC2 env、SSM Parameter Store 或 Secrets Manager。

如果 API token 曾經貼到聊天、文件或前端程式碼，請先到 Atlassian 帳號撤銷舊 token，再建立新 token 填入後端環境變數。

## EC2 權限

EC2 開機執行 user data 時，`aws ecr get-login-password` 需要 AWS 權限。建議用 EC2 Instance Profile / IAM Role，最少需要：

- ECR 讀取 image：`ecr:GetAuthorizationToken`、`ecr:BatchCheckLayerAvailability`、`ecr:GetDownloadUrlForLayer`、`ecr:BatchGetImage`
- SSM 管理 EC2：建議掛 `AmazonSSMManagedInstanceCore`
- 如果 Jira API token 放 SSM：`ssm:GetParameter`
- 如果 CWA API key 放 SSM：`ssm:GetParameter`
- 如果 SSM SecureString 用自訂 KMS key：`kms:Decrypt`

GitHub Actions 目前使用 GitHub OIDC assume role 部署，避免長期 AWS access key 放在 GitHub secrets。
