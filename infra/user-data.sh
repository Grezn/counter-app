#!/bin/bash
set -euxo pipefail

# 這份 user data 是給 ASG/EC2 開機時使用的。
# 重點：
# 1. EC2 要掛 IAM Role / Instance Profile，讓 aws cli 可以登入 ECR。
# 2. RESET_TOKEN / JIRA_API_TOKEN 建議放 SSM Parameter Store，不要寫死在 user data。
# 3. docker run 會把 Redis、Jira、氣象和 app 設定用環境變數傳進 container。

# ===== 記錄 log =====
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

echo "[UserData] start at $(date -Iseconds)"

# ===== 基本參數 =====
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="131730003210"
ECR_REPO="docker-demo"
IMAGE_TAG="latest"
IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"

# ===== Redis / ElastiCache =====
# 請填 Primary endpoint；不要填 configuration endpoint。
REDIS_ENDPOINT="demo-caches.nyynzy.ng.0001.use1.cache.amazonaws.com"
REDIS_PORT="6379"
REDIS_URL="redis://${REDIS_ENDPOINT}:${REDIS_PORT}"

# ===== App =====
CONTAINER_NAME="counter-app"
APP_PORT="3000"
HOST_PORT="80"

# ===== Jira =====
JIRA_BASE_URL="https://metaage-corp-p400.atlassian.net"
JIRA_REST_BASE_URL=""
JIRA_PROJECT_KEY="PMP"
JIRA_ISSUE_TYPE="交接事項"
JIRA_ISSUE_TYPE_ID=""
JIRA_LABELS="電話連絡,noc-oncall"
JIRA_DEFAULT_PRIORITY=""

# ===== 中央氣象署氣象資料開放平台 =====
CWA_LOCATION_NAME="臺北市"
CWA_DATASET_ID="F-C0032-001"
CWA_CITY_DATASET_ID="F-C0032-001"
CWA_TOWNSHIP_DATASET_ID="F-D0047-089"
CWA_MAX_LOCATION_DISTANCE_KM="80"
CWA_CACHE_TTL_MS="600000"

# ===== Secret =====
# 建議先在 SSM 建立 SecureString：
# aws ssm put-parameter --name /counter-app/prod/reset-token --type SecureString --value "你的長隨機token"
RESET_TOKEN_PARAM_NAME="/counter-app/prod/reset-token"
JIRA_EMAIL_PARAM_NAME="/counter-app/prod/jira-email"
JIRA_API_TOKEN_PARAM_NAME="/counter-app/prod/jira-api-token"
CWA_API_KEY_PARAM_NAME="/counter-app/prod/cwa-api-key"

echo "[UserData] IMAGE_URI=${IMAGE_URI}"
echo "[UserData] REDIS_ENDPOINT=${REDIS_ENDPOINT}:${REDIS_PORT}"

retry() {
  local max_attempts="$1"
  shift

  local attempt=1
  until "$@"; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "[UserData] command failed after ${max_attempts} attempts: $*"
      return 1
    fi

    echo "[UserData] retry ${attempt}/${max_attempts}: $*"
    attempt=$((attempt + 1))
    sleep 5
  done
}

install_packages() {
  if command -v dnf >/dev/null 2>&1; then
    # Amazon Linux 2023 通常已經有 curl-minimal。
    # 再安裝完整 curl 會衝突，所以這裡不要裝 curl。
    dnf install -y docker awscli jq
  else
    yum install -y docker awscli jq
  fi
}

ecr_login() {
  aws ecr get-login-password --region "$AWS_REGION" \
    | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
}

read_reset_token() {
  aws ssm get-parameter \
    --region "$AWS_REGION" \
    --name "$RESET_TOKEN_PARAM_NAME" \
    --with-decryption \
    --query "Parameter.Value" \
    --output text
}

read_optional_parameter() {
  local name="$1"

  aws ssm get-parameter \
    --region "$AWS_REGION" \
    --name "$name" \
    --with-decryption \
    --query "Parameter.Value" \
    --output text 2>/dev/null || true
}

# ===== 安裝 Docker / AWS CLI =====
retry 3 install_packages

systemctl enable docker
systemctl start docker
usermod -aG docker ec2-user || true

# ===== 讀取 Reset Token =====
# 如果這裡失敗，通常代表 EC2 IAM Role 少了 ssm:GetParameter 或 kms:Decrypt。
RESET_TOKEN="$(read_reset_token)"
if [ -z "$RESET_TOKEN" ] || [ "$RESET_TOKEN" = "None" ]; then
  echo "[UserData] ERROR: RESET_TOKEN is empty"
  exit 1
fi

# ===== 讀取 Jira 設定 =====
# Jira 是事件留存功能；沒設定時 app 仍會啟動，但建立小卡會顯示未設定。
JIRA_EMAIL="$(read_optional_parameter "$JIRA_EMAIL_PARAM_NAME")"
JIRA_API_TOKEN="$(read_optional_parameter "$JIRA_API_TOKEN_PARAM_NAME")"
if [ -z "$JIRA_EMAIL" ] || [ "$JIRA_EMAIL" = "None" ] || [ -z "$JIRA_API_TOKEN" ] || [ "$JIRA_API_TOKEN" = "None" ]; then
  echo "[UserData] WARN: Jira SSM parameters are not fully configured"
  JIRA_EMAIL=""
  JIRA_API_TOKEN=""
fi

# ===== 讀取氣象署開放平台授權碼 =====
# 沒設定時 app 仍會啟動，本地區氣象會顯示未設定。
CWA_API_KEY="$(read_optional_parameter "$CWA_API_KEY_PARAM_NAME")"
if [ -z "$CWA_API_KEY" ] || [ "$CWA_API_KEY" = "None" ]; then
  echo "[UserData] WARN: CWA API key SSM parameter is not configured"
  CWA_API_KEY=""
fi

# ===== ECR Login / 拉 image =====
# 如果這裡失敗，通常代表 EC2 IAM Role 少了 ECR read 權限。
retry 5 ecr_login
retry 5 docker pull "$IMAGE_URI"

# 用 image digest 當 APP_VERSION，方便你在 /whoami 看出目前跑哪個 image。
APP_VERSION="$(docker inspect --format='{{index .RepoDigests 0}}' "$IMAGE_URI" | awk -F'@' '{print $2}' | cut -c1-18)"
if [ -z "$APP_VERSION" ]; then
  APP_VERSION="$IMAGE_TAG"
fi
echo "[UserData] APP_VERSION=${APP_VERSION}"

# ===== 清掉舊容器 =====
docker rm -f "$CONTAINER_NAME" || true

# ===== 啟動新容器 =====
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  --health-cmd "wget -qO- http://127.0.0.1:${APP_PORT}/ready || exit 1" \
  --health-interval 30s \
  --health-timeout 5s \
  --health-retries 3 \
  --health-start-period 20s \
  -p "${HOST_PORT}:${APP_PORT}" \
  -e "PORT=${APP_PORT}" \
  -e "APP_VERSION=${APP_VERSION}" \
  -e "REDIS_HOST=${REDIS_ENDPOINT}" \
  -e "REDIS_PORT=${REDIS_PORT}" \
  -e "REDIS_URL=${REDIS_URL}" \
  -e "RESET_TOKEN=${RESET_TOKEN}" \
  -e "JIRA_BASE_URL=${JIRA_BASE_URL}" \
  -e "JIRA_REST_BASE_URL=${JIRA_REST_BASE_URL}" \
  -e "JIRA_EMAIL=${JIRA_EMAIL}" \
  -e "JIRA_API_TOKEN=${JIRA_API_TOKEN}" \
  -e "JIRA_PROJECT_KEY=${JIRA_PROJECT_KEY}" \
  -e "JIRA_ISSUE_TYPE=${JIRA_ISSUE_TYPE}" \
  -e "JIRA_ISSUE_TYPE_ID=${JIRA_ISSUE_TYPE_ID}" \
  -e "JIRA_LABELS=${JIRA_LABELS}" \
  -e "JIRA_DEFAULT_PRIORITY=${JIRA_DEFAULT_PRIORITY}" \
  -e "CWA_API_KEY=${CWA_API_KEY}" \
  -e "CWA_LOCATION_NAME=${CWA_LOCATION_NAME}" \
  -e "CWA_DATASET_ID=${CWA_DATASET_ID}" \
  -e "CWA_CITY_DATASET_ID=${CWA_CITY_DATASET_ID}" \
  -e "CWA_TOWNSHIP_DATASET_ID=${CWA_TOWNSHIP_DATASET_ID}" \
  -e "CWA_MAX_LOCATION_DISTANCE_KM=${CWA_MAX_LOCATION_DISTANCE_KM}" \
  -e "CWA_CACHE_TTL_MS=${CWA_CACHE_TTL_MS}" \
  "$IMAGE_URI"

# ===== 本機健康檢查 =====
sleep 8

echo "[UserData] container status:"
docker ps -a

echo "[UserData] container logs:"
docker logs --tail 80 "$CONTAINER_NAME" || true

echo "[UserData] local /health:"
curl -i --max-time 5 "http://127.0.0.1/health" || true

echo "[UserData] local /ready:"
curl -i --max-time 5 "http://127.0.0.1/ready" || true

echo "[UserData] local /whoami:"
curl -i --max-time 5 "http://127.0.0.1/whoami" || true

echo "[UserData] done at $(date -Iseconds)"
