# Counter App 維運手冊

這份文件是給日常部署和除錯用的。目標是讓你不用每次都重新想一次流程。

## 目前部署流程

```text
git push origin main
-> GitHub Actions build Docker image
-> push image 到 ECR
-> start ASG instance refresh
-> ASG 建立新 EC2
-> EC2 user data 安裝 Docker、拉 ECR image、啟動 container
-> ALB target group 檢查 /ready
```

## 哪些 key 可以移除

### EC2 裡的 AWS access key

可以移除，而且建議移除。

EC2 不應該靠 IAM User access key 操作 AWS。它應該靠 Launch Template / EC2 綁定的 IAM Role，也就是 Instance Profile。

EC2 role 至少需要：

- `AmazonEC2ContainerRegistryReadOnly`
- `AmazonSSMReadOnlyAccess`

如果 SSM SecureString 使用自訂 KMS key，還需要 `kms:Decrypt`。

### GitHub Secrets 裡的 AWS key

改成 OIDC 前先不要移除。

如果 `.github/workflows/deploy.yml` 已經改成 `role-to-assume`，而且 OIDC role 測試部署成功，就可以移除：

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

`AWS_ACCOUNT_ID` 不是秘密，workflow 目前已經直接寫在 env 裡，不需要放 GitHub secret。

## GitHub Actions 改用 OIDC

OIDC 的目的：GitHub Actions 部署時向 AWS 換短期憑證，不再保存長期 AWS access key。

目前 workflow 會 assume 這個 role：

```text
arn:aws:iam::131730003210:role/counter-app-github-actions-deploy
```

第一次使用前，先在 CloudShell 建立 OIDC provider 和 IAM role：

```bash
cd counter-app
git pull
bash infra/setup-github-oidc.sh
```

如果你是第一次把 OIDC workflow push 上去，GitHub Actions 可能會先失敗一次，因為 IAM Role 還不存在。這是正常的 bootstrap 順序：

1. 先 push 這次 OIDC 修改，讓 CloudShell 可以 `git pull` 到 `infra/setup-github-oidc.sh`。
2. 到 CloudShell 跑 `bash infra/setup-github-oidc.sh`。
3. 回 GitHub Actions 按 `Re-run jobs`，或再 push 一個 commit。

這個腳本會：

1. 建立 GitHub OIDC provider：`token.actions.githubusercontent.com`
2. 建立 IAM Role：`counter-app-github-actions-deploy`
3. 限制只有 `Grezn/counter-app` 的 `main` branch 可以 assume role
4. 授權 GitHub Actions push/pull `docker-demo` ECR image
5. 授權 GitHub Actions 啟動和查詢 ASG instance refresh

建立完成後，push 一次測試：

```bash
git add .
git commit -m "use GitHub OIDC for AWS deploy"
git push origin main
```

如果 GitHub Actions 成功，就可以到 GitHub repo settings 刪除：

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

`AWS_ACCOUNT_ID` 也可以刪，因為它不是 secret，而且 workflow 已經不需要從 GitHub secret 讀它。

### Reset Token

舊的 reset token 可以不用了。

正式 token 現在放在 SSM Parameter Store：

```text
/counter-app/prod/reset-token
```

建立或更新 token：

```bash
TOKEN="$(openssl rand -hex 32)"

aws ssm put-parameter \
  --region us-east-1 \
  --name /counter-app/prod/reset-token \
  --type SecureString \
  --value "$TOKEN" \
  --overwrite
```

查詢 token：

```bash
aws ssm get-parameter \
  --region us-east-1 \
  --name /counter-app/prod/reset-token \
  --with-decryption \
  --query Parameter.Value \
  --output text
```

## 正常部署

平常只改程式碼時：

```bash
git add .
git commit -m "你的 commit 訊息"
git push origin main
```

GitHub Actions 會自動 build/push image，並啟動 ASG instance refresh。

## 限制網站來源 IP

這個網站目前有內部連結與 SOP，建議先用 ALB Security Group 限制來源 IP。

最簡單的概念是：

```text
ALB Security Group inbound
80  -> 只允許你的 IP/32
443 -> 只允許你的 IP/32
```

如果你用 AWS Console：

1. 到 EC2 -> Security Groups。
2. 找 ALB 使用的 security group：`sg-071602cd50cb138bc`。
3. 編輯 inbound rules。
4. 先新增你的 IP，例如 `你的IP/32`，開 TCP 80 和 443。
5. 確認網站還能打開。
6. 移除 `0.0.0.0/0` 的 80 和 443。

如果你想用 CloudShell，可以用 repo 裡的腳本：

```bash
ALLOWED_CIDRS="你的IP/32 另一個IP/32" bash infra/restrict-alb-source-ip.sh
```

腳本支援多個 IP，用空白或逗號分隔。

注意：不要在 CloudShell 裡用 `curl checkip` 當你的 IP，因為那會拿到 CloudShell 的出口 IP，不一定是你瀏覽器所在地的 IP。

如果之後換網路、手機熱點、公司 VPN，IP 可能會變。網站打不開時，先檢查 ALB Security Group 的 inbound source。

## 改 user data 時

如果有修改 `infra/user-data.sh`，只 push GitHub 還不夠，因為 ASG 不會自動讀 repo 裡的 user data 檔案。

需要另外做：

1. 把 `infra/user-data.sh` 貼到 Launch Template 的 User data。
2. 建立新的 Launch Template version。
3. 讓 ASG 使用新的 Launch Template version。
4. Start instance refresh。

## 健康檢查

- `/health`：只檢查 Node.js app 還活著。
- `/ready`：檢查 Redis 也能連線。

Docker healthcheck 和 ALB target group 建議使用 `/ready`。

## 常用除錯指令

進入新 EC2 後：

```bash
sudo tail -n 200 /var/log/user-data.log
docker ps -a
docker logs --tail 100 counter-app
curl -i http://127.0.0.1/health
curl -i http://127.0.0.1/ready
curl -i http://127.0.0.1/whoami
```

如果 `docker: command not found`，代表 user data 在安裝 Docker 階段就失敗。

如果 `/health` 正常但 `/ready` 失敗，通常是 Redis/ElastiCache 連線問題。

如果 GitHub Actions 顯示 `InstanceRefreshInProgress`，代表 AWS 已經有一個 ASG refresh 在跑。新版 workflow 會等待現有 refresh，不會直接失敗。

## 優化順序

建議照這個順序慢慢做：

1. 確認 EC2 完全改用 IAM Role，不再保存 AWS access key。
2. 限制網站存取來源，例如 ALB Security Group 限定你的 IP，或加登入。
3. 把 GitHub Actions 從 IAM User key 改成 OIDC assume role。
4. 把 image 部署從 `latest` 改成固定 SHA tag，方便 rollback。
5. 移除 `app/` 重複專案，只保留一份程式碼。
6. 把 `public/index.html` 拆成 HTML/CSS/JS，讓前端比較好維護。
