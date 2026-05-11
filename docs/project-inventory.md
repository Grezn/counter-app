# Counter App 專案總整理

最後整理日期：2026-05-11

這份文件把目前 repo 裡能確認的網路、AWS 資源、部署流程、應用功能和外部依賴集中在一起。除非特別註明，內容都是從這個 repo 的程式碼、Terraform、GitHub Actions 和腳本整理出來；AWS Console、Cloudflare Console 裡的即時狀態仍以實際畫面為準。

## 一句話架構

```text
使用者瀏覽器
-> Cloudflare DNS only 灰雲，只做 DNS 解析
-> AWS public ALB 80/443
-> ALB Target Group
-> ASG 裡的 EC2 instance port 80
-> Docker container counter-app port 3000
-> Node.js Express app
-> Redis / ElastiCache、Jira Cloud、中央氣象署 API、後端 JSON runbooks
```

## 目前重要結論

- 專案目前只保留根目錄這一份 app，正式部署吃根目錄的 `Dockerfile` 和程式碼。
- Cloudflare 目前是 DNS only，所以瀏覽器會直接連 AWS ALB，並看到 ALB 上的 ACM 憑證。
- 因為 Cloudflare 沒有 proxy，Cloudflare WAF、Access、IP allowlist 不會保護這個站。
- 主要入口安全邊界應放在 AWS ALB Security Group。
- 建議 ALB Security Group 的 80 和 443 source 都引用 AWS customer-managed prefix list，之後新增 IP 只改 prefix list。
- app 本身目前沒有登入系統，只有 reset 動作需要 `RESET_TOKEN`。

## Repo 結構

| 路徑 | 用途 | 備註 |
| --- | --- | --- |
| `server.js` | Express app 入口 | 掛 routes、靜態檔案、request log、安全 headers、graceful shutdown |
| `routes/counter.js` | 首頁、計數器、訪客統計、reset API | 依賴 Redis |
| `routes/health.js` | `/health`、`/ready` | `/ready` 會 ping Redis |
| `routes/jira.js` | Jira Cloud issue 建立 API | 後端代送，token 不進前端 |
| `routes/runbooks.js` | SOP / Runbook API | 從 `data/runbooks.json` 讀資料 |
| `routes/weather.js` | 本地即時氣象 API proxy | 呼叫中央氣象署觀測與預報 API |
| `services/redis.js` | Redis client | 支援 `REDIS_URL` 或 `REDIS_HOST` + `REDIS_PORT` |
| `public/index.html` | 前端畫面 | MSP 值班中控台 |
| `public/app.js` | 前端互動邏輯 | localStorage、API 呼叫、交班摘要 |
| `public/styles.css` | 前端樣式 | light/dark theme |
| `data/runbooks.json` | SOP / Runbook 資料 | 只應放可出現在前端的資訊 |
| `Dockerfile` | production image | Node 20 Alpine，跑 `npm start` |
| `docker-compose.yml` | 本機或手動容器設定 | 預設 host `80` -> container `3000` |
| `.github/workflows/deploy.yml` | CI/CD | build、push ECR、SSM in-place deploy |
| `infra/envs/prod/main.tf` | AWS ALB/TG/ASG Terraform | 多數資源是 imported / prevent destroy |
| `infra/user-data.sh` | EC2 開機部署腳本 | 初次或換機時用 `latest` image 啟動 |
| `infra/*.sh` | CloudShell 維運腳本 | OIDC、SSM 權限、ALB IP 限制、更新 user data |

## 應用層資訊

### Runtime

| 項目 | 值 |
| --- | --- |
| Runtime | Node.js 20 Alpine |
| Framework | Express 4 |
| Redis library | `redis` 4 |
| App name | `counter-app` |
| Container port | `3000` |
| EC2 host port | `80` |
| Docker container name | `counter-app` |
| Docker restart policy | `unless-stopped` |
| Docker healthcheck | `wget -qO- http://127.0.0.1:3000/ready` |
| JSON body limit | `64kb` |
| Timezone used for daily stats | `Asia/Taipei` |

### HTTP endpoints

| Method | Path | 功能 | 備註 |
| --- | --- | --- | --- |
| `GET` | `/` | 回傳首頁 | `public/index.html` |
| `GET` | `/whoami` | 回傳 app/version | 不回 container hostname |
| `GET` | `/health` | app process health | 不檢查 Redis |
| `GET` | `/ready` | readiness | 會 ping Redis，ALB/Docker 使用這個 |
| `POST` | `/track-view` | 訪客/瀏覽統計 | 需要 Redis |
| `GET` | `/stats` | 統計資料 | 需要 Redis |
| `GET` | `/count` | 目前 counter | 需要 Redis |
| `POST` | `/increment` | counter +1 | 需要 Redis |
| `POST` | `/reset` | counter 歸零 | 需要 `x-reset-token` header |
| `GET` | `/api/jira/status` | Jira 設定狀態 | 不回 token |
| `POST` | `/api/jira/issues` | 建立 Jira issue | 後端 Basic auth 呼叫 Jira REST API |
| `GET` | `/api/runbooks` | 搜尋/列出 SOP | 支援 `category`、`q` query |
| `GET` | `/api/weather/local` | 本地即時氣象 | 支援定位座標、最近測站觀測、預報與快取 |

### Redis keys

| Key | 類型 | 用途 | TTL |
| --- | --- | --- | --- |
| `counter` | string/integer | 畫面上的目前計數 | 無 |
| `stats:total_page_views` | string/integer | 累計瀏覽數 | 無 |
| `stats:daily_page_views:YYYY-MM-DD` | string/integer | 每日瀏覽數 | 30 天 |
| `stats:total_unique_visitors` | HyperLogLog | 累計不重複訪客估算 | 無 |
| `stats:daily_unique_visitors:YYYY-MM-DD` | HyperLogLog | 每日不重複訪客估算 | 30 天 |
| `stats:active_visitors_zset` | sorted set | 最近 30 秒活躍訪客 | 約 60 秒 |
| `incidents:recent` | list | 最近事件暫存紀錄，供未結案列表、搜尋篩選與交班檢查列使用 | 無 |

### Browser storage

| Key | Storage | 用途 | 備註 |
| --- | --- | --- | --- |
| `msp_theme` | localStorage | light/dark theme | 非敏感 |
| `visitor_id` | localStorage | 訪客統計 ID | 非帳號身分 |
| `noc_incident_state` | localStorage | 值班事件暫存 | 個人瀏覽器資料，不送後端保存 |
| `noc_incident_active_record_id` | localStorage | 目前載入的事件紀錄 ID | 讓再次儲存時更新同一筆 Redis 紀錄 |
| `reset_token` | sessionStorage | reset token 暫存 | 關閉分頁後消失 |

## 前端功能

- Dashboard：本地即時氣象、累計訪客、今日訪客、目前在線、日期與事件留存。
- 計數器分頁：目前計數、+1、重設。
- Reset：需要輸入 `RESET_TOKEN`，前端只放在本分頁 `sessionStorage`。
- 本地即時氣象：瀏覽器可用 Geolocation，後端呼叫中央氣象署最近測站觀測與預報 API；也可在前端用「地區」手動固定顯示地區，避免桌機定位偏移。
- 事件留存與交班：表單資料存在 localStorage，可產生交班摘要、追蹤狀態、交班前檢查、事件搜尋篩選與處理紀錄時間軸。
- Jira 小卡：把事件與交班摘要送到後端，再由後端建立 Jira issue。
- SOP 速查：從 `/api/runbooks` 讀取 `data/runbooks.json`。
- 值班入口側邊欄：常用外部系統連結。
- 話機通話測試：前端組 tel link，號碼目前是 `+886800008669`，接通後按 `3`。

## 外部入口連結

這些連結會直接出現在前端 HTML，因此只能放登入頁、入口頁或可公開給值班人員看的固定入口，不要放 token、密碼、客戶敏感資料。

### 每日值班

| 名稱 | URL |
| --- | --- |
| Jira | `https://metaage-corp-p400.atlassian.net/jira/core/projects/PMP/board?filter=&groupBy=status` |
| Outlook 郵件 | `https://outlook.cloud.microsoft/mail/` |
| 官方 LINE | `https://chat.line.biz/U8c283f2c2fa0a4a60807e86a9474e802/` |
| 設備檢查表 | `https://forms.office.com/Pages/ResponsePage.aspx?id=fJowoSKEfk2DKqRqO2dIXDL92xpZgdhAoa8oJTt9h7dURDZNTkpMQkRCT0RBSVpRMzk4REhIOUFUMy4u` |
| 輪班表 | `https://dtimis.sharepoint.com/:x:/s/P400-P400/EbAHuKozowhItY7fzhOxlGgB-wwGX7D12r36wpLXbQUD4g?e=q3ZKNA` |

### AWS

| 名稱 | URL |
| --- | --- |
| AWS Console | `https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1#` |
| 公司 SSO | `https://metaage.awsapps.com/start#/` |
| AWS Health | `https://health.aws.amazon.com/health/status` |
| AWS 計算機 | `https://calculator.aws/#/addService` |
| AWS Skill Builder | `https://explore.skillbuilder.aws/learn` |

### 公司連接

| 名稱 | URL |
| --- | --- |
| KB | `https://kb.aws-metaage.com/` |
| BPM | `https://bpm.metaage.com.tw/Gaia/portal` |
| CloudMan | `https://www.cloudman.app/` |
| OneDrive | `https://dtimis-my.sharepoint.com/` |
| ITOP | `https://support.aws-sysage.com/pages/UI.php` |

### 其他

| 名稱 | URL |
| --- | --- |
| 電話錄音下載 | `https://jp.dubber.net/%E5%B8%B3%E6%88%B6/d63e63ada4f3448093cbe9792c66f12a/%E9%8C%84%E9%9F%B3` |

## Runbook / SOP 資料

來源：`data/runbooks.json`

| 類別 | Runbook | 備註 |
| --- | --- | --- |
| Dell Server/Storage | Dell Server/Storage 值班 SOP | 非上班時間報修信件、值班電話、轉寄與通話紀錄 |
| PureStorage | PureStorage 值班信件分類 SOP | ASP / AWS MSP 值班合作與信件分類 |
| Akamai | Akamai 進線與開 Case SOP | CDN / AAP / Linode / EAA 進線、開 Case、升級 |
| 奧義智慧 | 奧義智慧 Xensor 告警處理 SOP | Xcockpit / Xensor alert 狀態、隔離、結案 |
| MinIO | MinIO Subnet Issue / Panic SOP | iTop 進線、Subnet Issue、Panic Alert |

備註：`data/runbooks.json` 的 note 明確寫著只放允許值班人員在此系統查看的 SOP 資訊；更詳細或敏感的正式文件仍建議放 SharePoint / KB / ITOP。

## AWS 帳號與區域

| 項目 | 值 | 來源 |
| --- | --- | --- |
| AWS account id | `131730003210` | repo 多處設定 |
| Region | `us-east-1` | Terraform、GitHub Actions、user-data |
| ECR repository | `docker-demo` | GitHub Actions、user-data |
| ECR image URI | `131730003210.dkr.ecr.us-east-1.amazonaws.com/docker-demo` | GitHub Actions |
| GitHub repository | `Grezn/counter-app` | OIDC script |
| GitHub branch | `main` | GitHub Actions、OIDC script |

## DNS / 憑證

### Cloudflare

目前從截圖判斷：

| Record | 類型 | Proxy status | 備註 |
| --- | --- | --- | --- |
| `sefi.uk` | CNAME | DNS only | 指向 `counter-app-alb-...`，完整 ALB DNS 需到 Cloudflare/AWS 確認 |
| `www` | CNAME | DNS only | 指向 `sefi.uk` |
| `_...` validation CNAME | CNAME | DNS only | 推測為憑證或網域驗證，不應改橘雲 |

使用 DNS only 的效果：

- 使用者瀏覽器直接連 AWS ALB。
- 瀏覽器看到的是 ALB 上的 ACM 憑證。
- Cloudflare 只做 DNS，不提供 WAF / Access / proxy 保護。
- 若 ALB Security Group 放太寬，直接打 ALB DNS 或指定 Host/SNI 仍可能繞過網域入口。

### AWS ACM / ALB HTTPS

| 項目 | 值 |
| --- | --- |
| Listener | ALB `443` |
| Certificate ARN | `arn:aws:acm:us-east-1:131730003210:certificate/f517b2da-2ec6-41a1-872c-9aae3f13ce79` |
| SSL policy | `ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09` |

備註：ACM 憑證能保護正式網域 HTTPS，但不是存取控制。若希望阻擋直接打 ALB DNS，仍要靠 Security Group、Host header rule 或其他 auth。

## 網路與 AWS 基礎資源

### Terraform state

| 項目 | 值 |
| --- | --- |
| Backend | S3 |
| Bucket | `131730003210-counter-app-tfstate` |
| Key | `counter-app/prod/terraform.tfstate` |
| Region | `us-east-1` |
| DynamoDB lock table | `counter-app-terraform-locks` |
| Encryption | enabled |

### VPC / Subnet

| 項目 | 值 |
| --- | --- |
| VPC ID | `vpc-0e929ca22e398f512` |
| ALB subnets | `subnet-013ee08c32691e2cf`, `subnet-08f75ba3284367f37`, `subnet-0a844d612f61b1b92` |
| ASG subnets | `subnet-013ee08c32691e2cf`, `subnet-08f75ba3284367f37` |

### ALB

| 項目 | 值 |
| --- | --- |
| Name | `counter-app-alb` |
| Type | Application Load Balancer |
| Scheme | internet-facing |
| Security Group | `sg-071602cd50cb138bc` |
| Terraform lifecycle | `prevent_destroy = true` |

### ALB listeners

| Port | Protocol | Action | 備註 |
| --- | --- | --- | --- |
| `80` | HTTP | redirect to `443` | `HTTP_301` |
| `443` | HTTPS | forward to target group | default action ignore changes in Terraform |

### Target Group

| 項目 | 值 |
| --- | --- |
| Name | `counter-app-tg` |
| ARN | `arn:aws:elasticloadbalancing:us-east-1:131730003210:targetgroup/counter-app-tg/337a14de9c9b122c` |
| Protocol | HTTP |
| Port | `80` |
| Target type | instance |
| Health path | `/ready` |
| Matcher | `200` |
| Interval | `30s` |
| Timeout | `10s` |
| Healthy threshold | `2` |
| Unhealthy threshold | `3` |

### Auto Scaling Group

| 項目 | 值 |
| --- | --- |
| Name | `counter-app-asg` |
| Desired | `1` |
| Min | `1` |
| Max | `2` |
| Health check type | `ELB` |
| Health check grace period | `300` |
| Launch Template | `counter-app-template` |
| Launch Template version | `$Default` |
| Terraform lifecycle | `prevent_destroy = true`, `ignore_changes = all` |

### Launch Template

| 項目 | 值 |
| --- | --- |
| Name | `counter-app-template` |
| update_default_version | `true` |
| Terraform lifecycle | `prevent_destroy = true`, `ignore_changes = all` |

備註：Terraform 目前不管理 launch template 的細節，user data 更新透過 `infra/update-asg-user-data.sh` 建新 version。

## Security Group 與 Prefix List

### 目前方向

因為 Cloudflare 是 DNS only，ALB Security Group 是主要入口控管點。

建議 inbound 最終維持：

```text
HTTP   TCP 80   Source = counter-app-allowed-ips prefix list
HTTPS  TCP 443  Source = counter-app-allowed-ips prefix list
```

這樣新增 IP 時只要更新 prefix list，不用再對 80 和 443 各新增一次。

### 從本次對話截圖看到的狀態

| Source | 用途 | 備註 |
| --- | --- | --- |
| `pl-0ea3b7c1fa06b4c90` | prefix list source | description 顯示 `counter-app-allowed-ips pref...` |
| `114.45.62.75/32` | 單獨 admin IP | description 顯示 `counter-app-admin-ip` |

建議確認 `114.45.62.75/32` 是否已加入 `pl-0ea3b7c1fa06b4c90`。確認加入後，Security Group 裡的單獨 80/443 規則可以刪，只留 prefix list 兩條。

### 既有腳本

`infra/restrict-alb-source-ip.sh` 目前可用來加單獨 CIDR 到 ALB SG 的 80/443，並移除 `0.0.0.0/0`。它還沒有改成 prefix list 管理。

備註：如果之後要完全自動化 prefix list，可以新增一支 script 或 Terraform resource 管理 `aws_ec2_managed_prefix_list` 與 SG source。

## Redis / ElastiCache

| 項目 | 值 |
| --- | --- |
| Endpoint | `demo-caches.nyynzy.ng.0001.use1.cache.amazonaws.com` |
| Port | `6379` |
| URL | `redis://demo-caches.nyynzy.ng.0001.use1.cache.amazonaws.com:6379` |
| 用途 | counter、訪客統計、active visitors |

備註：user-data 註解提醒要填 Primary endpoint，不要填 configuration endpoint。

## Secrets / Parameter Store

正式秘密應放在 AWS SSM Parameter Store 或 Secrets Manager，不進 Git、不進前端。

| Parameter | 類型建議 | 用途 | 必要性 |
| --- | --- | --- | --- |
| `/counter-app/prod/reset-token` | SecureString | `/reset` 授權 | 必要，缺少時 reset 不可用 |
| `/counter-app/prod/jira-email` | String | Jira Basic auth email | Jira 建卡需要 |
| `/counter-app/prod/jira-api-token` | SecureString | Jira API token | Jira 建卡需要 |
| `/counter-app/prod/cwa-api-key` | SecureString | 中央氣象署 API 授權碼 | 氣象功能需要 |

EC2 role 需要：

- `ssm:GetParameter`
- `ssm:GetParameters`
- 如果 SecureString 使用 KMS，還需要 `kms:Decrypt`
- SSM 管理需要 `AmazonSSMManagedInstanceCore`

## 環境變數

### App / Docker

| 變數 | 用途 | 預設或正式值來源 |
| --- | --- | --- |
| `PORT` | Express listen port | `3000` |
| `APP_VERSION` | `/whoami` 顯示版本 | Git SHA 前段或 image digest |
| `IMAGE_URI` | Docker image | compose / deploy |
| `REDIS_URL` | Redis 完整 URL | user-data / deploy |
| `REDIS_HOST` | Redis host | user-data / deploy |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_CONNECT_TIMEOUT_MS` | Redis connect timeout | `3000` |
| `REDIS_CONNECT_MAX_RETRIES` | Redis startup reconnect retry | `5` |
| `RESET_TOKEN` | reset 授權 token | SSM |

### Jira

| 變數 | 值或用途 |
| --- | --- |
| `JIRA_BASE_URL` | `https://metaage-corp-p400.atlassian.net` |
| `JIRA_REST_BASE_URL` | 可選，空白時使用 `/rest/api/3` |
| `JIRA_EMAIL` | SSM |
| `JIRA_API_TOKEN` | SSM |
| `JIRA_PROJECT_KEY` | `PMP` |
| `JIRA_ISSUE_TYPE` | `交接事項` |
| `JIRA_ISSUE_TYPE_ID` | 可選 |
| `JIRA_LABELS` | `電話連絡,noc-oncall` |
| `JIRA_DEFAULT_PRIORITY` | 可選 |

### Weather / CWA

| 變數 | 值或用途 |
| --- | --- |
| `CWA_API_KEY` | SSM |
| `CWA_LOCATION_NAME` | `臺北市` |
| `CWA_DATASET_ID` | `F-C0032-001` |
| `CWA_CITY_DATASET_ID` | `F-C0032-001` |
| `CWA_TOWNSHIP_DATASET_ID` | `F-D0047-089` |
| `CWA_OBSERVATION_DATASET_ID` | `O-A0001-001` |
| `CWA_MAX_LOCATION_DISTANCE_KM` | `80` |
| `CWA_MAX_OBSERVATION_DISTANCE_KM` | `80` |
| `CWA_CACHE_TTL_MS` | `180000` |

## CI/CD

### GitHub Actions

Workflow：`.github/workflows/deploy.yml`

| 項目 | 值 |
| --- | --- |
| Trigger | push to `main` |
| Concurrency group | `counter-app-deploy` |
| AWS auth | GitHub OIDC assume role |
| Role ARN | `arn:aws:iam::131730003210:role/counter-app-github-actions-deploy` |
| ECR repo | `docker-demo` |
| ASG | `counter-app-asg` |
| Fallback | `ALLOW_ASG_REFRESH_FALLBACK=false` |

流程：

1. Checkout source.
2. Assume AWS deploy role with OIDC.
3. Login to ECR.
4. Build Docker image from repo root.
5. Tag image as `latest` and `${github.sha}`.
6. Push both tags to ECR.
7. Query ASG in-service instances.
8. Check each instance SSM PingStatus.
9. Send SSM command to EC2.
10. On EC2, pull SHA image.
11. Start candidate container on `127.0.0.1:18080`.
12. Check candidate `/ready`, `/health`, `/whoami`.
13. Stop candidate, replace production container on host port `80`.
14. Check production `/ready`, `/health`, `/whoami`.
15. If production check fails, attempt rollback to old image.
16. Prune old Docker images older than 24h.
17. If SSM fails and fallback is disabled, fail workflow and keep old container.

### OIDC role setup

Script：`infra/setup-github-oidc.sh`

Creates or updates:

- OIDC provider：`token.actions.githubusercontent.com`
- IAM role：`counter-app-github-actions-deploy`
- Trust only：`repo:Grezn/counter-app:ref:refs/heads/main`
- Permissions：ECR push/pull, ASG describe/refresh, SSM send command/get invocation.

### EC2 initial boot

Script：`infra/user-data.sh`

流程：

1. Log to `/var/log/user-data.log`.
2. Install Docker, AWS CLI, jq.
3. Start Docker.
4. Read `/counter-app/prod/reset-token`.
5. Optionally read Jira email/API token.
6. Optionally read CWA API key.
7. Login to ECR.
8. Pull `docker-demo:latest`.
9. Compute `APP_VERSION` from image digest.
10. Remove old `counter-app` container.
11. Run container on host `80` -> container `3000`.
12. Print Docker status, logs, `/health`, `/ready`, `/whoami`.

### User data update

Script：`infra/update-asg-user-data.sh`

用途：

- Resolve ASG launch template.
- Create new launch template version with base64 encoded `infra/user-data.sh`.
- Set new version as default.
- Update ASG to use `$Default`.
- Optionally start and wait for ASG instance refresh.

## Local development

### Install / start

```bash
npm install
npm start
```

App defaults:

- port：`3000`
- Redis：`127.0.0.1:6379`
- APP_VERSION：`v6` if not set

### Docker compose

```bash
docker compose up
```

`docker-compose.yml` 預設：

- image：`${IMAGE_URI}` or `131730003210.dkr.ecr.us-east-1.amazonaws.com/docker-demo:latest`
- host port：`80`
- container port：`3000`
- healthcheck：`/ready`

備註：本機如果沒有 Redis 或沒有連到正式 Redis，`/ready` 會失敗，依賴 Redis 的功能也會報錯。

## 安全備註

### 目前已有

- Express 關閉 `x-powered-by`。
- 設定 `X-Content-Type-Options: nosniff`。
- 設定 `Referrer-Policy: no-referrer`。
- 設定 `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`。
- 設定 `Cross-Origin-Resource-Policy: same-origin`。
- JSON body limit `64kb`。
- Request log 使用 JSON，包含 request id、path、status、latency、client ip。
- Reset token 不寫在前端程式碼。
- Jira token 和 CWA API key 只透過後端環境變數使用。

### 目前風險 / 注意

- 網站本身沒有登入，主要靠網路層 allowlist。
- Cloudflare 是 DNS only，不提供 proxy security。
- 若 ALB SG 來源太寬，直接打 ALB 可以繞過 Cloudflare DNS 名稱。
- ALB listener 目前沒有 Host header allow rule，直接 ALB DNS 或非預期 Host 仍會進 default action。
- Terraform 對 Launch Template 和 ASG 是 `ignore_changes = all`，Console/腳本變更不一定會在 Terraform diff 中顯示。
- `Dockerfile` 目前沒有 package lock，所以使用 `npm install --omit=dev`，dependency 解析可能不是完全固定。

## 建議後續優化

1. 確認 ALB Security Group 只剩 prefix list 的 80/443，舊的單獨 IP 規則移除。
2. 在 ALB 443 listener 加 Host header rule，只允許 `sefi.uk` 和 `www.sefi.uk` forward，其他回 403。
3. 把 prefix list 管理自動化，至少文件化 entries owner。
4. 新增 `package-lock.json`，Dockerfile 改成 `npm ci --omit=dev`。
5. 釐清 Terraform 是否要完整接管 Security Group、Prefix List、Listener rules。
6. 長期若不想靠 IP，改成登入機制或 Cloudflare Access，但那會讓使用者看到 Cloudflare edge 憑證，而不是 ACM 憑證。
7. 把 `public/index.html` 拆成較小的 HTML/CSS/JS 模組，降低日後維護成本。
