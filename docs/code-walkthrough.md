# 程式碼導讀

這份文件用「一個 request 從瀏覽器進來，到資料寫進 Redis」的角度看整個專案。

## 先說結論：不用急著改 Python

目前專案已經用 Node.js / Express 跑通：

```text
Browser -> Vue/Vite frontend -> Express API -> Redis
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
  Express app 入口，負責啟動網站、serve Vue build、掛 API routes、寫 request log。

frontend/
  Vue + Vite 前端。App.vue 組合 components；src/components/ 放頁首、本地氣象、訪客統計、事件標題/操作工具列、事件欄位/快速接案/事件樣板/常用句/處理紀錄時間軸/Jira 狀態/交班提醒/摘要徽章/摘要文字/摘要狀態、事件 checklist、交班摘要面板、事件歷史狀態/事件歷史焦點列/事件歷史列表/重複事件提示/報修補充欄位/工作流/歷史紀錄、SOP 速查、值班入口與回頂部按鈕。
  src/composables/ 放主題/分頁、本地氣象、訪客統計、快速接案、事件樣板 selector、常用句選單、處理紀錄時間軸、Jira 狀態、事件核心欄位、事件 checklist 狀態、事件歷史狀態、事件歷史焦點列、事件歷史列表、事件歷史 view、重複事件提示、下次確認欄位狀態、交班提醒狀態、摘要徽章狀態、摘要文字、摘要狀態訊息、服務類型補充欄位顯示、交班摘要格式、事件歷史搜尋/篩選、SOP、值班入口狀態與 `useWindowBridge.js`；所有 `__msp*` window bridge 註冊集中在這個 helper。
  src/api/ 集中 Vue composables 對 Express API 的 JSON request / error parsing。
  legacyBridge.js 集中代理暫時保留的 public/app.js 互動函式。

services/visitorStats.js
  訪客統計 service，集中 Redis key、memory fallback、visitor id、台北日期與 active visitors 邏輯。

services/incidents.js
  事件紀錄 service，集中資料清洗、Redis hash/sorted set、legacy list migration、memory fallback 與結案/刪除狀態轉換。

services/jira.js
  Jira service，集中設定檢查、ADF payload 組裝、priority/label 推導與 Atlassian REST 呼叫。

services/runbooks.js
  Runbook service，集中 data/runbooks.json 載入、搜尋、分類過濾與 MCP 摘要格式。

services/weather.js
  本地氣象 service，集中 CWA/Open-Meteo 呼叫、快取、觀測站解析、預報與 local degraded response。

services/redis.js
  建立 Redis 連線，其他檔案都透過它拿 Redis client。

routes/health.js
  /health 和 /ready。
  /ready 會回報 Redis 狀態；Redis 不可用時 app 仍可服務前端。

routes/counter.js
  訪客統計 API controller。
  新路徑是 /api/visitor-stats/*；舊 /track-view、/stats、/heartbeat 保留相容。

routes/incidents.js
  事件紀錄 API controller，把 HTTP request 交給 services/incidents.js。

routes/jira.js
  Jira API controller，把狀態查詢與建卡請求交給 services/jira.js，token 不回前端。

routes/runbooks.js
  Runbook API controller，把搜尋與分類查詢交給 services/runbooks.js。

routes/weather.js
  本地即時氣象 API controller，把查詢參數交給 services/weather.js；外部氣象來源不可用時仍回穩定 JSON。

data/runbooks.json
  值班 SOP / Runbook 資料。
  只放可以顯示在前端的處理骨架，不放帳密、客戶資料或內部敏感細節。

public/index.html
  Vue build fallback；正式 build 後首頁會由 frontend/dist/index.html 回應，這裡只顯示建置提示。

public/styles.css
  前端樣式來源，Vue build 會打包成 assets CSS。

public/app.js
  既有前端互動橋接，現在由 Vue shell 載入後接上。
  值班事件處理台的 localStorage 暫存、交班摘要計算、Jira 建卡草稿準備 / 成功後 checklist 副作用、事件儲存狀態同步，以及 SOP 帶入事件草稿橋接仍在這裡。
  Visitor stats、Jira 建卡與 incidents CRUD API 已改由 Vue composable + Vue API client 管理；事件時間/客戶/系統/主旨/問題描述/影響範圍/接手人員/下一步/已通知/嚴重度/目前狀態/來源欄位、快速接案文字、處理紀錄時間軸、追蹤狀態 select 與下次確認欄位狀態、摘要文字、摘要格式、事件樣板選取、事件歷史 view 與儲存按鈕狀態也已由 Vue 顯示，public/app.js 不再直接 fetch，legacy helper 暫留表單 DOM、副作用與本機 fallback orchestration。
  readIncidentStateFromPage() 聚合事件 snapshot 時，會優先讀 `__mspIncidentState.getState()`；這個 Vue bridge 統一彙整 core fields、處理紀錄、追蹤狀態、checklist 與報修補充資料。值班草稿的 `loadState` / `saveState` / `clearState`、事件狀態套用 `applyState`、快速接案/樣板/Runbook 的欄位/radio/follow-up 補值、常用句與處理紀錄文字追加，以及清空 UI state 也先透過 `__mspIncidentState`；若 bridge 尚未準備好，才 fallback 到個別 bridge getter、DOM 掃描與 legacy localStorage。

Dockerfile
  把 Node.js app 打包成 Docker image。

scripts/api-smoke.mjs
  本機 API smoke 測試。會檢查 Vue shell、health/ready、訪客統計、事件紀錄 CRUD、Jira 狀態、Runbook 搜尋與 Weather endpoint。

scripts/incidents-service-smoke.mjs
  模擬 Redis unavailable，確認 incidents service 的 validation、create、update、resolve、list、delete memory fallback。

scripts/weather-service-smoke.mjs
  模擬外部氣象來源失敗，確認 weather service 仍回 HTTP 200、source 與 current shape。

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
5. Express 靜態服務優先回傳 `frontend/dist/index.html`
6. 瀏覽器載入 Vue bundle 與 CSS assets
7. Vue mount 中控台畫面後，`useAppShell.js` 接管主題、分頁與 URL hash
8. Vue 再載入既有互動橋接，接上事件表單操作與 SOP 帶入事件草稿

```text
frontend/src/composables/useAppShell.js
-> msp_theme localStorage
-> #sop / dashboard hash navigation

frontend/src/composables/useLinksPanel.js
-> msp_oncall_checklist:<yyyy-mm-dd> localStorage
-> 值班入口開關 / 一鍵開啟每日值班 / 話機通話測試

frontend/src/composables/useRunbooks.js
-> GET /api/runbooks
-> SOP 分類 / 搜尋 / 複製 / 帶入事件草稿

frontend/src/api/
-> 集中 fetch JSON、query string、HTTP error parsing

frontend/src/api/incidents.js
-> list/create/update/resolve/delete /api/incidents
-> 目前事件紀錄遠端 CRUD 已由 useIncidentHistoryApiBridge.js 透過這層呼叫；public/app.js 保留表單讀寫、active record、localStorage fallback 等副作用

frontend/src/composables/useIncidentQuickIntake.js
-> 快速接案輸入狀態
-> Vue 傳入 quick intake 文字，legacy bridge 帶入事件草稿或追加處理紀錄

frontend/src/composables/useIncidentTemplates.js
-> 事件樣板選項與選取狀態
-> Vue 傳入 template id，legacy bridge 套用樣板到空白事件欄位

frontend/src/composables/useIncidentCoreFields.js
-> 事件核心欄位狀態
-> legacy bridge 在載入草稿、快速接案、事件樣板、Runbook 帶入、事件時間帶入、常用句插入與清空事件時同步 startedAt/severity/status/customer/system/source/title/problemDescription/impact/handoverOwner/nextStep/notified，Vue 負責欄位 value 與 select 選項狀態

frontend/src/composables/useIncidentPhrases.js
-> 下一步 / 處理紀錄常用句選單狀態
-> 透過 legacy bridge 插入常用句並更新摘要

frontend/src/composables/useIncidentNotesTimeline.js
-> 處理紀錄 textarea value 與時間軸解析狀態
-> legacy bridge 傳入 notes 值，Vue 負責 textarea 顯示、解析與時間軸顯示

frontend/src/composables/useIncidentNextCheck.js
-> 追蹤狀態 select 與下次確認欄位 disabled/title 狀態
-> legacy bridge 同步 trackingStatus / nextCheckAt，Vue 負責追蹤狀態選項、欄位值、disabled 與 title

frontend/src/composables/useIncidentChecklist.js
-> 事件 checklist 勾選狀態
-> legacy bridge 在載入草稿、快速接案、Jira 建卡、Runbook 帶入與清空事件時同步 checks，Vue 負責 checkbox checked 狀態

frontend/src/composables/useHandoverReadiness.js
-> 交班提醒列顯示狀態與 action bridge
-> legacy bridge 計算提醒項目，Vue 負責畫出標籤、說明與動作按鈕

frontend/src/composables/useHandoverSummaryBadge.js
-> 交班摘要完整 / 缺漏徽章狀態
-> legacy bridge 計算缺漏欄位，Vue 負責顯示徽章文字與 title

frontend/src/composables/useHandoverSummaryText.js
-> 交班摘要 textarea 文字
-> legacy bridge 計算摘要內容，Vue 負責顯示文字

frontend/src/composables/useHandoverSummaryStatus.js
-> 交班摘要狀態訊息與缺漏欄位連結
-> legacy bridge 同步一般訊息，並保留缺漏欄位的聚焦 action

frontend/src/composables/useJiraStatus.js
-> Jira 建卡狀態訊息與建立後連結
-> POST /api/jira/issues
-> legacy bridge 只提供目前事件草稿、完整交班摘要與建卡成功後的 checklist/localStorage 副作用

frontend/src/composables/useIncidentSaveStatus.js
-> 事件儲存按鈕 label、saving disabled 狀態、目前編輯中的事件紀錄 ID localStorage 與已儲存 snapshot
-> legacy bridge 透過 `__mspIncidentSaveStatus` 讀寫 active record id / saved snapshot / saving state，Vue 負責按鈕顯示、active id 暫存與未儲存比對基準

frontend/src/composables/useIncidentHistoryStatus.js
-> 事件歷史 / 儲存 / 刪除 / 結案狀態訊息
-> legacy bridge 同步事件紀錄操作的 pending、success、error 文字

frontend/src/composables/useDuplicateIncidentStatus.js
-> 相似未結案事件提示狀態
-> legacy bridge 計算重複候選並保留還原事件 action

frontend/src/composables/useIncidentServiceDetails.js
-> 服務類型選取、是否為客戶、後續處理方式多選 checked 狀態、報修補充欄位 values、欄位顯示與提示文字
-> 透過 legacy bridge 同步已載入或已清空的表單狀態，Vue 負責服務類型 radio、是否為客戶 radio、後續處理 checkbox 與報修補充 text/select/textarea 的 value 狀態

frontend/src/composables/useHandoverSummaryMode.js
-> 交班摘要完整 / 精簡 / 更新格式切換狀態
-> Vue 負責按鈕 active/aria 顯示，legacy bridge 更新摘要文字

frontend/src/composables/useIncidentHistoryView.js
-> 事件紀錄未結案 / 全部篩選狀態
-> Vue 負責按鈕 active/aria 顯示，legacy bridge 載入對應事件列表

frontend/src/composables/useIncidentHistoryFilters.js
-> 事件紀錄關鍵字 / 客戶 / 系統篩選狀態
-> 透過 legacy bridge 套用篩選並同步客戶、系統選項

frontend/src/composables/useIncidentHistoryFocus.js
-> 事件紀錄追蹤焦點列狀態
-> legacy bridge 同步未結案、待確認、缺下一步、等回覆、可結案等 counts，Vue 負責畫出焦點 chips

frontend/src/composables/useLocalWeather.js
-> GET /api/weather/local
-> CWA/Open-Meteo 都不可用時仍可顯示 local degraded response

frontend/src/composables/useVisitorStats.js
-> POST /api/visitor-stats/views
-> GET /api/visitor-stats
-> POST /api/visitor-stats/heartbeat
```

## 訪客統計怎麼運作

前端由 `VisitorStatsGrid.vue` 的 `useVisitorStats()` 呼叫：

```text
POST /api/visitor-stats/views
GET /api/visitor-stats
POST /api/visitor-stats/heartbeat
```

舊版 `/track-view`、`/stats`、`/heartbeat` 還留在後端 route 裡，讓已部署或快取中的舊前端不會突然壞掉。

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
- 追蹤狀態
- 下次確認時間
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

「複製交班摘要」會先檢查一句話主旨、目前狀態、影響範圍、下一步、追蹤狀態與已通知。摘要標題旁會顯示完整度，並可切換完整、精簡、更新三種輸出；缺欄位時不會複製，提示裡的欄位名稱可以直接點擊跳去補齊。完整摘要保留所有欄位，精簡摘要只保留主旨、狀態、影響、下一步、追蹤狀態與下次確認，更新摘要會列出目前表單相對載入紀錄的變更欄位；儲存事件與建立 Jira 小卡仍使用完整摘要，避免正式紀錄被精簡版覆蓋。

交班前檢查列會整合目前表單與未結案紀錄，以「交班提醒」顯示摘要待補、目前事件尚未儲存或更新、已到下次確認時間、未結案事件沒有下一步，以及可結案事件。提示文字可以直接點擊，帶去補欄位、儲存事件或查看事件列表。若目前表單與未結案紀錄標題、客戶或系統相近，會另外顯示相似事件提醒，避免同一個告警被重開一筆。

「儲存事件紀錄」會把目前表單與交班摘要寫入事件 API。Redis 可用時會持久化到 Redis；Redis 不可用時後端暫用 process memory，前端仍會保留 localStorage fallback。載入既有事件後再次儲存會更新同一筆，事件卡片可標記已解決或刪除；列表預設只顯示未結案，也可以切到全部，並可用關鍵字、客戶或系統篩選。交接時以交班摘要為準，不另外維護第二份重複內容。

「追蹤狀態」會顯示在交班摘要與事件卡片上。不需追蹤或可結案的事件會自動清除並停用下次確認時間，摘要顯示為不需設定。下次確認是選填提醒，不確定時間時可以留空；有填時間才會在到期後標示待確認。等客戶回覆或等二線回覆也可以不填明確確認時間，但事件卡片仍會保留等待狀態。

「下次確認」會顯示在交班摘要與事件卡片上；未結案事件到時間後會標示為待確認並排到列表前面，畫面每分鐘重新判斷一次。

「事件樣板」可以快速帶入磁碟告警、CPU / 記憶體、網站異常、備份失敗、VPN / 線路與等回覆觀察等常見情境。樣板只會補空白欄位，不會覆蓋已輸入內容，也不會自動填下次確認時間。

「下一步」與「處理紀錄」旁的常用句按鈕會開啟小選單，將固定句插入欄位尾端；處理紀錄會自動帶入目前時間，減少值班時重複輸入。處理紀錄若以 `HH:mm` 或 `MM/DD HH:mm` 開頭，欄位下方會自動整理成小時間軸，方便交班前快速掃過處理順序。

報修表單補充資訊是參考「第一線客戶資訊表」做的，預設收在可展開區。補充欄位會依服務類型收斂：一般諮詢只留後續處理與補充說明，產品報修才顯示合約、序號、型號等欄位，AWS 邀請組織則保留產品與窗口資訊並用補充說明承接特殊需求。這些欄位仍然只存在你的瀏覽器，不會自動送去 Microsoft Forms；它的用途是讓你值班時先整理資料，最後複製交班摘要或再貼到正式表單。

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
Redis 不能用時，/ready 仍會回 ready/degraded，避免值班台被統計功能拖垮。
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

1. `frontend/src/App.vue`：先看首頁如何組合事件處理台、氣象統計、SOP 速查與值班入口。
2. `frontend/src/components/`：看各區塊的 Vue template；SOP 速查與中控台外殼已經在這裡。
3. `frontend/src/composables/`：看主題、分頁、氣象、訪客統計、快速接案、事件樣板 selector、事件核心欄位、常用句選單、處理紀錄時間軸、Jira 狀態、事件 checklist 狀態、事件歷史 API bridge、事件歷史狀態、事件歷史列表、事件歷史 view、重複事件提示、下次確認欄位狀態、交班提醒狀態、摘要徽章狀態、摘要文字、摘要狀態訊息、服務類型補充欄位顯示、交班摘要格式、事件歷史搜尋/篩選、SOP、值班入口狀態與 `useWindowBridge.js`。
4. `public/app.js`：看暫時保留的事件表單、交班摘要、Jira 與事件紀錄橋接。
5. `frontend/src/api/`：看 Vue 端如何集中呼叫 Express API。
6. `routes/counter.js`：看 API controller 怎麼把 request 交給 service。
7. `services/visitorStats.js`：看訪客統計怎麼操作 Redis、memory fallback 與 active visitors。
8. `services/incidents.js`：看事件紀錄怎麼清洗、持久化、結案、刪除與 fallback。
9. `services/jira.js`：看 Jira 建卡 payload、設定檢查和 Atlassian REST 呼叫。
10. `services/runbooks.js`：看 SOP 資料如何載入、搜尋與提供給 HTTP/MCP。
11. `services/weather.js`：看本地氣象、CWA/Open-Meteo fallback、local degraded response 與快取。
12. `services/redis.js`：看 Redis URL 怎麼組出來。
13. `server.js`：看 Express app 怎麼啟動和掛 route。
14. `routes/health.js`：看健康檢查。
15. `scripts/incidents-service-smoke.mjs`：看事件紀錄 service 在 Redis unavailable 時的 memory fallback 契約。
16. `scripts/api-smoke.mjs`：看本機 API smoke 如何避免誤寫遠端並覆蓋主要 endpoints。
16. `infra/user-data.sh`：看 EC2 怎麼啟動 container。
17. `.github/workflows/deploy.yml`：看 CI/CD 怎麼把 image 推到 AWS。
