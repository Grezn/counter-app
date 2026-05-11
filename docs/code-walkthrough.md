# 程式碼導讀

這份文件用「一個 request 從瀏覽器進來，到資料寫進 Redis」的角度看整個專案。

## 先說結論：不用急著改 Python

目前專案已經用 Node.js / Express 跑通：

```text
Browser -> ALB -> EC2 Docker container -> Express -> Redis
```

如果現在改成 Python，需要重新調整：

- Dockerfile
- package/dependency 管理
- Express routes 對應到 Flask/FastAPI routes
- Redis client
- health check
- CI/CD build image

所以現階段比較好的學習方式是：保留已經成功部署的 JavaScript，先靠註解和文件讀懂它。

## 檔案地圖

```text
server.js
  Express app 入口，負責啟動網站、掛 routes、寫 request log。

services/redis.js
  建立 Redis 連線，其他檔案都透過它拿 Redis client。

routes/health.js
  /health 和 /ready。
  /ready 會 ping Redis，所以 ALB/Docker healthcheck 用它。

routes/counter.js
  首頁、訪客統計、計數器 +1、reset 都在這裡。

routes/runbooks.js
  /api/runbooks。
  從後端 data/runbooks.json 讀 SOP / Runbook 資料，再回傳給前端顯示。

data/runbooks.json
  值班 SOP / Runbook 資料。
  只放可以顯示在前端的處理骨架，不放帳密、客戶資料或內部敏感細節。

public/index.html
  前端 HTML 結構，只放畫面內容。

public/styles.css
  前端樣式，控制排版、顏色、表單、按鈕和 RWD。

public/app.js
  前端互動邏輯。
  按鈕點擊後會用 fetch 呼叫後端 API。
  值班事件處理台的 localStorage 暫存、交班摘要產生、SOP / Runbook 顯示，以及快速入口一鍵開啟也在這裡。

Dockerfile
  把 Node.js app 打包成 Docker image。

.github/workflows/deploy.yml
  GitHub Actions CI/CD。
  push 到 main 後 build image、push ECR，優先用 SSM 更新現有 EC2 container，失敗才 refresh ASG。

infra/user-data.sh
  EC2 開機時執行。
  安裝 Docker、登入 ECR、讀 SSM token、啟動 container。
```

## 網頁第一次打開時發生什麼事

1. 使用者打開 `https://sefi.uk`
2. Cloudflare DNS 把網域指到 ALB
3. ALB 把 request 轉到 healthy EC2
4. Docker container 裡的 Express 收到 request
5. `routes/counter.js` 的 `router.get("/")` 回傳 `public/index.html`
6. 瀏覽器載入 HTML、CSS、JavaScript
7. JavaScript 執行：

```text
trackView()
loadCount()
setInterval(loadStats, 30000)
```

## 訪客統計怎麼運作

前端呼叫：

```text
POST /track-view
```

後端做：

```text
stats:total_page_views             -> 總瀏覽次數
stats:daily_page_views:YYYY-MM-DD  -> 今日瀏覽次數
stats:total_unique_visitors        -> 總不重複訪客，HyperLogLog
stats:daily_unique_visitors:日期   -> 今日不重複訪客，HyperLogLog
stats:active_visitors_zset         -> 最近 30 秒活躍訪客，Sorted Set
```

為什麼用 HyperLogLog：

```text
它可以估算不重複訪客數，而且比存一大堆 visitor id 更省 Redis 記憶體。
```

為什麼 Active Now 用 Sorted Set：

```text
score 放 timestamp。
每次訪客出現就更新時間。
超過 30 秒沒出現就移除。
```

## Current Count 怎麼運作

前端按 `+1`：

```text
POST /increment
```

後端執行：

```js
redis.incr("counter")
```

Redis 的 `incr` 是原子操作。就算兩個人同時按，也不會互相蓋掉。

前端按 `Reset`：

```text
POST /reset
x-reset-token: 使用者輸入的 token
```

後端會比對：

```text
process.env.RESET_TOKEN
```

這個 token 不是存在 GitHub，也不是寫死在 HTML，而是 EC2 user data 從 SSM Parameter Store 讀出來，再傳給 Docker container。

## 值班事件處理台怎麼運作

事件處理台先把目前編輯中的事件存在瀏覽器 localStorage。

它使用：

```text
localStorage key: noc_incident_state
```

保存這些資料：

- 事件時間
- 嚴重度
- 目前狀態
- 告警來源
- 客戶 / 單位
- 系統 / 設備
- 事件主旨
- 問題描述
- 影響範圍
- 已通知對象
- 下一步
- 處理紀錄
- checklist 勾選狀態
- 報修表單補充資訊，例如產品、合約、序號、服務類型、後續處理方式

為什麼先放 localStorage：

```text
這些是值班當下的個人暫存筆記。
不用登入、不用資料庫、不影響後端服務。
重新整理網頁後還會保留。
```

如果清掉瀏覽器資料，目前表單內容也會消失。

「複製交班摘要」會先檢查一句話主旨、目前狀態、影響範圍、下一步與已通知。缺欄位時不會複製，會提示缺什麼並把游標帶到第一個缺漏欄位；補齊後才會把接手重點、問題影響、下一步和已完成檢查組成文字，方便貼到 Jira、交班小卡或訊息。

「儲存事件紀錄」會把目前表單與交班摘要寫入 Redis 的最近紀錄清單。載入既有事件後再次儲存會更新同一筆，事件卡片可標記已解決或刪除；列表預設只顯示未結案，也可以切到全部。交接時以交班摘要為準，不另外維護第二份重複內容。

「下一步」與「處理紀錄」旁的常用句按鈕會開啟小選單，將固定句插入欄位尾端；處理紀錄會自動帶入目前時間，減少值班時重複輸入。

報修表單補充資訊是參考「第一線客戶資訊表」做的，預設收在可展開區。這些欄位仍然只存在你的瀏覽器，不會自動送去 Microsoft Forms；它的用途是讓你值班時先整理資料，最後複製交班摘要或再貼到正式表單。

## 前端安全邊界

瀏覽器 F12 可以看到所有前端 HTML、CSS、JS，所以前端不要寫死：

- 公司內部 URL
- 電話、信箱、CC 清單
- SOP 細節
- token、密碼、AWS / Redis / ECR 資訊

目前快速入口保留每日值班、AWS、公司連接和其他常用入口。這些固定連結會出現在前端原始碼中，因為它們本身仍需要各系統帳密或 SSO 才能使用。

正式 SOP、電話、信箱和客戶資料應放在公司授權系統。

## /health 和 /ready 差在哪

`/health`：

```text
只代表 Node.js app 還活著。
```

`/ready`：

```text
會 ping Redis。
Redis 不能用時，/ready 會回 500。
```

所以 ALB target group 用 `/ready` 比較準。

## 部署流程怎麼串起來

1. 你 `git push origin main`
2. GitHub Actions 開始跑
3. GitHub Actions 用 OIDC 向 AWS STS 換短期憑證
4. Docker build image
5. Docker push image 到 ECR
6. 找出 ASG 裡健康中的 EC2 instance
7. 優先用 SSM Run Command 在現有 EC2 上執行部署腳本
8. EC2 拉新的 SHA image、讀 SSM token/API key、重啟 `counter-app`
9. 部署腳本檢查 `/health`、`/ready`、`/whoami`
10. 如果 SSM 快速部署失敗，workflow 才呼叫 ASG `start-instance-refresh`
11. ASG 建立新 EC2，新 EC2 跑 `infra/user-data.sh`
12. ALB 檢查 `/ready`，新 target healthy 後舊 EC2 進入 draining

## 讀程式建議順序

建議照這個順序讀：

1. `public/app.js`：先看前端按鈕會呼叫哪些 API。
2. `routes/counter.js`：看 API 收到 request 後怎麼操作 Redis。
3. `services/redis.js`：看 Redis URL 怎麼組出來。
4. `server.js`：看 Express app 怎麼啟動和掛 route。
5. `routes/health.js`：看健康檢查。
6. `infra/user-data.sh`：看 EC2 怎麼啟動 container。
7. `.github/workflows/deploy.yml`：看 CI/CD 怎麼把 image 推到 AWS。
