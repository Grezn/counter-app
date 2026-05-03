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

目前先不要移除。

GitHub Actions 目前仍使用：

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_ACCOUNT_ID`

這些 secret 用來 build/push ECR image 和啟動 ASG instance refresh。

之後可以改成 GitHub OIDC assume role。改完 OIDC 後，才可以移除 GitHub 裡的長期 AWS access key。

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
