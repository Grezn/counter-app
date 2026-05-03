#!/bin/bash
set -euo pipefail

# 用途：
#   限制 ALB Security Group，只允許指定 IP 連到網站的 80/443。
#
# 使用方式：
#   1. 先查你的「家裡/公司目前出口 IP」。
#   2. 在 CloudShell 執行：
#      ALLOWED_CIDRS="你的IP/32 另一個IP/32" bash infra/restrict-alb-source-ip.sh
#
# 注意：
#   不要在 CloudShell 用 curl checkip 自動抓 IP。
#   CloudShell 抓到的是 CloudShell 的 IP，不一定是你瀏覽器所在的 IP。

AWS_REGION="${AWS_REGION:-us-east-1}"
ALB_SECURITY_GROUP_ID="${ALB_SECURITY_GROUP_ID:-sg-071602cd50cb138bc}"
ALLOWED_CIDRS="${ALLOWED_CIDRS:-${ALLOWED_CIDR:-}}"

if [ -z "$ALLOWED_CIDRS" ]; then
  echo "ERROR: 請先設定 ALLOWED_CIDRS，例如："
  echo 'ALLOWED_CIDRS="203.0.113.10/32 198.51.100.20/32" bash infra/restrict-alb-source-ip.sh'
  exit 1
fi

echo "[RestrictALB] region: ${AWS_REGION}"
echo "[RestrictALB] security group: ${ALB_SECURITY_GROUP_ID}"
echo "[RestrictALB] allowed sources: ${ALLOWED_CIDRS}"

authorize_ingress() {
  local port="$1"
  local cidr="$2"

  aws ec2 authorize-security-group-ingress \
    --region "$AWS_REGION" \
    --group-id "$ALB_SECURITY_GROUP_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=${port},ToPort=${port},IpRanges=[{CidrIp=${cidr},Description=counter-app-admin-ip}]" \
    >/dev/null 2>&1 || true
}

revoke_world_ingress() {
  local port="$1"

  aws ec2 revoke-security-group-ingress \
    --region "$AWS_REGION" \
    --group-id "$ALB_SECURITY_GROUP_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=${port},ToPort=${port},IpRanges=[{CidrIp=0.0.0.0/0}]" \
    >/dev/null 2>&1 || true
}

# 先加自己的 IP，再移除全世界，避免中間瞬間鎖住。
# 支援空白或逗號分隔，例如："1.1.1.1/32 2.2.2.2/32" 或 "1.1.1.1/32,2.2.2.2/32"。
for cidr in ${ALLOWED_CIDRS//,/ }; do
  authorize_ingress 80 "$cidr"
  authorize_ingress 443 "$cidr"
done

revoke_world_ingress 80
revoke_world_ingress 443

echo "[RestrictALB] current ingress rules:"
aws ec2 describe-security-groups \
  --region "$AWS_REGION" \
  --group-ids "$ALB_SECURITY_GROUP_ID" \
  --query 'SecurityGroups[0].IpPermissions'

echo "[RestrictALB] done"
