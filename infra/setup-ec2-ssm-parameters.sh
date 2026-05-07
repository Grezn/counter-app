#!/bin/bash
set -euo pipefail

# 用途：
#   補齊 counter-app EC2 Instance Profile 讀取 Parameter Store 的權限。
#   SSM 快速部署時，docker run 是在 EC2 上執行；因此 CWA_API_KEY
#   需要由 EC2 的 IAM Role 讀 /counter-app/prod/cwa-api-key。
#
# 使用方式：
#   在 AWS CloudShell 執行：
#     bash infra/setup-ec2-ssm-parameters.sh

AWS_REGION="${AWS_REGION:-us-east-1}"
ASG_NAME="${ASG_NAME:-counter-app-asg}"
PARAMETER_PATH="${PARAMETER_PATH:-/counter-app/prod}"
POLICY_NAME="${POLICY_NAME:-counter-app-ssm-parameters}"

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
PARAMETER_PATH="${PARAMETER_PATH%/}"
NORMALIZED_PARAMETER_PATH="${PARAMETER_PATH#/}"
PARAMETER_RESOURCE_ARN="arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/${NORMALIZED_PARAMETER_PATH}/*"

echo "[EC2 SSM] account: ${AWS_ACCOUNT_ID}"
echo "[EC2 SSM] region: ${AWS_REGION}"
echo "[EC2 SSM] asg: ${ASG_NAME}"
echo "[EC2 SSM] parameter path: ${PARAMETER_PATH}"

get_asg_query() {
  aws autoscaling describe-auto-scaling-groups \
    --region "$AWS_REGION" \
    --auto-scaling-group-names "$ASG_NAME" \
    --query "$1" \
    --output text
}

resolve_instance_profile_from_launch_template() {
  local launch_template_id
  local launch_template_name
  local launch_template_version
  local query_args
  local profile_name
  local profile_arn

  launch_template_id="$(get_asg_query "AutoScalingGroups[0].LaunchTemplate.LaunchTemplateId")"
  launch_template_name="$(get_asg_query "AutoScalingGroups[0].LaunchTemplate.LaunchTemplateName")"
  launch_template_version="$(get_asg_query "AutoScalingGroups[0].LaunchTemplate.Version")"

  if [ -z "$launch_template_version" ] || [ "$launch_template_version" = "None" ]; then
    launch_template_version="\$Default"
  fi

  query_args=(--region "$AWS_REGION" --versions "$launch_template_version")
  if [ -n "$launch_template_id" ] && [ "$launch_template_id" != "None" ]; then
    query_args+=(--launch-template-id "$launch_template_id")
  else
    query_args+=(--launch-template-name "$launch_template_name")
  fi

  profile_name="$(aws ec2 describe-launch-template-versions \
    "${query_args[@]}" \
    --query "LaunchTemplateVersions[0].LaunchTemplateData.IamInstanceProfile.Name" \
    --output text)"

  if [ -n "$profile_name" ] && [ "$profile_name" != "None" ]; then
    printf "%s" "$profile_name"
    return 0
  fi

  profile_arn="$(aws ec2 describe-launch-template-versions \
    "${query_args[@]}" \
    --query "LaunchTemplateVersions[0].LaunchTemplateData.IamInstanceProfile.Arn" \
    --output text)"

  if [ -n "$profile_arn" ] && [ "$profile_arn" != "None" ]; then
    printf "%s" "${profile_arn##*/}"
    return 0
  fi

  return 1
}

resolve_instance_profile_from_current_instance() {
  local instance_id
  local profile_arn

  instance_id="$(get_asg_query "AutoScalingGroups[0].Instances[0].InstanceId")"
  if [ -z "$instance_id" ] || [ "$instance_id" = "None" ]; then
    return 1
  fi

  profile_arn="$(aws ec2 describe-instances \
    --region "$AWS_REGION" \
    --instance-ids "$instance_id" \
    --query "Reservations[0].Instances[0].IamInstanceProfile.Arn" \
    --output text)"

  if [ -z "$profile_arn" ] || [ "$profile_arn" = "None" ]; then
    return 1
  fi

  printf "%s" "${profile_arn##*/}"
}

INSTANCE_PROFILE_NAME="${INSTANCE_PROFILE_NAME:-}"
if [ -z "$INSTANCE_PROFILE_NAME" ]; then
  INSTANCE_PROFILE_NAME="$(resolve_instance_profile_from_launch_template || true)"
fi

if [ -z "$INSTANCE_PROFILE_NAME" ]; then
  INSTANCE_PROFILE_NAME="$(resolve_instance_profile_from_current_instance || true)"
fi

if [ -z "$INSTANCE_PROFILE_NAME" ]; then
  echo "[EC2 SSM] ERROR: cannot resolve EC2 instance profile from ASG ${ASG_NAME}"
  echo "[EC2 SSM] Set INSTANCE_PROFILE_NAME=your-profile-name and run again."
  exit 1
fi

INSTANCE_ROLE_NAME="${INSTANCE_ROLE_NAME:-}"
if [ -z "$INSTANCE_ROLE_NAME" ]; then
  INSTANCE_ROLE_NAME="$(aws iam get-instance-profile \
    --instance-profile-name "$INSTANCE_PROFILE_NAME" \
    --query "InstanceProfile.Roles[0].RoleName" \
    --output text)"
fi

if [ -z "$INSTANCE_ROLE_NAME" ] || [ "$INSTANCE_ROLE_NAME" = "None" ]; then
  echo "[EC2 SSM] ERROR: cannot resolve IAM role from instance profile ${INSTANCE_PROFILE_NAME}"
  exit 1
fi

POLICY_FILE="$(mktemp)"
trap 'rm -f "$POLICY_FILE"' EXIT

cat > "$POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadCounterAppParameters",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "${PARAMETER_RESOURCE_ARN}"
    },
    {
      "Sid": "DecryptSecureStringParameters",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:CallerAccount": "${AWS_ACCOUNT_ID}",
          "kms:ViaService": "ssm.${AWS_REGION}.amazonaws.com"
        }
      }
    }
  ]
}
EOF

echo "[EC2 SSM] instance profile: ${INSTANCE_PROFILE_NAME}"
echo "[EC2 SSM] role: ${INSTANCE_ROLE_NAME}"
echo "[EC2 SSM] attaching AmazonSSMManagedInstanceCore"
aws iam attach-role-policy \
  --role-name "$INSTANCE_ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

echo "[EC2 SSM] putting inline policy: ${POLICY_NAME}"
aws iam put-role-policy \
  --role-name "$INSTANCE_ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "file://${POLICY_FILE}"

echo "[EC2 SSM] done"
echo "[EC2 SSM] EC2 can now read ${PARAMETER_RESOURCE_ARN}"
