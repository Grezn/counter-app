#!/bin/bash
set -euo pipefail

# 用途：
#   把 repo 裡的 infra/user-data.sh 更新到 ASG 使用的 Launch Template。
#   只修改 Launch Template 的 UserData，其他設定沿用目前版本。
#
# 使用方式：
#   在 AWS CloudShell 的 repo 根目錄執行：
#     bash infra/update-asg-user-data.sh

AWS_REGION="${AWS_REGION:-us-east-1}"
ASG_NAME="${ASG_NAME:-counter-app-asg}"
USER_DATA_FILE="${USER_DATA_FILE:-infra/user-data.sh}"
START_INSTANCE_REFRESH="${START_INSTANCE_REFRESH:-1}"
WAIT_FOR_REFRESH="${WAIT_FOR_REFRESH:-1}"

if [ ! -f "$USER_DATA_FILE" ]; then
  echo "[UserData] ERROR: file not found: ${USER_DATA_FILE}"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[UserData] ERROR: jq is required. CloudShell normally has jq preinstalled."
  exit 1
fi

echo "[UserData] region: ${AWS_REGION}"
echo "[UserData] asg: ${ASG_NAME}"
echo "[UserData] source: ${USER_DATA_FILE}"

read -r LAUNCH_TEMPLATE_ID LAUNCH_TEMPLATE_NAME LAUNCH_TEMPLATE_VERSION < <(
  aws autoscaling describe-auto-scaling-groups \
    --region "$AWS_REGION" \
    --auto-scaling-group-names "$ASG_NAME" \
    --query "AutoScalingGroups[0].LaunchTemplate.[LaunchTemplateId,LaunchTemplateName,Version]" \
    --output text
)

if [ -z "${LAUNCH_TEMPLATE_ID:-}" ] || [ "$LAUNCH_TEMPLATE_ID" = "None" ]; then
  echo "[UserData] ERROR: cannot resolve launch template from ASG ${ASG_NAME}"
  exit 1
fi

CURRENT_VERSION_NUMBER="$(aws ec2 describe-launch-template-versions \
  --region "$AWS_REGION" \
  --launch-template-id "$LAUNCH_TEMPLATE_ID" \
  --versions "$LAUNCH_TEMPLATE_VERSION" \
  --query "LaunchTemplateVersions[0].VersionNumber" \
  --output text)"

if [ -z "$CURRENT_VERSION_NUMBER" ] || [ "$CURRENT_VERSION_NUMBER" = "None" ]; then
  echo "[UserData] ERROR: cannot resolve launch template version ${LAUNCH_TEMPLATE_VERSION}"
  exit 1
fi

USER_DATA_B64="$(base64 -w 0 "$USER_DATA_FILE")"
LAUNCH_TEMPLATE_DATA_FILE="$(mktemp)"
trap 'rm -f "$LAUNCH_TEMPLATE_DATA_FILE"' EXIT

jq -n --arg userData "$USER_DATA_B64" '{UserData: $userData}' > "$LAUNCH_TEMPLATE_DATA_FILE"

echo "[UserData] launch template: ${LAUNCH_TEMPLATE_NAME} (${LAUNCH_TEMPLATE_ID})"
echo "[UserData] source version: ${CURRENT_VERSION_NUMBER}"

NEW_VERSION_NUMBER="$(aws ec2 create-launch-template-version \
  --region "$AWS_REGION" \
  --launch-template-id "$LAUNCH_TEMPLATE_ID" \
  --source-version "$CURRENT_VERSION_NUMBER" \
  --launch-template-data "file://${LAUNCH_TEMPLATE_DATA_FILE}" \
  --query "LaunchTemplateVersion.VersionNumber" \
  --output text)"

echo "[UserData] new version: ${NEW_VERSION_NUMBER}"

aws ec2 modify-launch-template \
  --region "$AWS_REGION" \
  --launch-template-id "$LAUNCH_TEMPLATE_ID" \
  --default-version "$NEW_VERSION_NUMBER" \
  >/dev/null

aws autoscaling update-auto-scaling-group \
  --region "$AWS_REGION" \
  --auto-scaling-group-name "$ASG_NAME" \
  --launch-template "LaunchTemplateId=${LAUNCH_TEMPLATE_ID},Version=\$Default"

echo "[UserData] ASG now uses launch template default version ${NEW_VERSION_NUMBER}"

if [ "$START_INSTANCE_REFRESH" != "1" ]; then
  echo "[UserData] skipped instance refresh because START_INSTANCE_REFRESH=${START_INSTANCE_REFRESH}"
  exit 0
fi

set +e
START_OUTPUT="$(aws autoscaling start-instance-refresh \
  --region "$AWS_REGION" \
  --auto-scaling-group-name "$ASG_NAME" \
  --preferences '{"MinHealthyPercentage":100,"InstanceWarmup":120}' \
  --query "InstanceRefreshId" \
  --output text 2>&1)"
START_EXIT=$?
set -e

if [ "$START_EXIT" -eq 0 ]; then
  REFRESH_ID="$START_OUTPUT"
  echo "[UserData] started instance refresh: ${REFRESH_ID}"
elif echo "$START_OUTPUT" | grep -q "InstanceRefreshInProgress"; then
  REFRESH_ID="$(aws autoscaling describe-instance-refreshes \
    --region "$AWS_REGION" \
    --auto-scaling-group-name "$ASG_NAME" \
    --query "InstanceRefreshes[?Status=='Pending' || Status=='InProgress' || Status=='Cancelling' || Status=='RollbackInProgress'] | [0].InstanceRefreshId" \
    --output text)"
  echo "[UserData] using existing instance refresh: ${REFRESH_ID}"
else
  echo "$START_OUTPUT"
  exit "$START_EXIT"
fi

if [ "$WAIT_FOR_REFRESH" != "1" ]; then
  echo "[UserData] not waiting because WAIT_FOR_REFRESH=${WAIT_FOR_REFRESH}"
  exit 0
fi

for attempt in {1..60}; do
  STATUS="$(aws autoscaling describe-instance-refreshes \
    --region "$AWS_REGION" \
    --auto-scaling-group-name "$ASG_NAME" \
    --instance-refresh-ids "$REFRESH_ID" \
    --query "InstanceRefreshes[0].Status" \
    --output text)"

  echo "[UserData] attempt ${attempt}: refresh status is ${STATUS}"

  case "$STATUS" in
    Successful)
      echo "[UserData] done"
      exit 0
      ;;
    Failed|Cancelled|RollbackFailed|RollbackSuccessful)
      echo "[UserData] ERROR: instance refresh ended with ${STATUS}"
      exit 1
      ;;
  esac

  sleep 30
done

echo "[UserData] ERROR: instance refresh did not finish in time"
exit 1
