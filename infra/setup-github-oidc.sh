#!/bin/bash
set -euo pipefail

# 用途：
#   建立 GitHub Actions OIDC Provider 和部署用 IAM Role。
#   建好後，GitHub Actions 就不用 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY。
#
# 使用方式：
#   在 AWS CloudShell 執行：
#     bash infra/setup-github-oidc.sh

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-Grezn/counter-app}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
ROLE_NAME="${ROLE_NAME:-counter-app-github-actions-deploy}"
ECR_REPOSITORY="${ECR_REPOSITORY:-docker-demo}"
ASG_NAME="${ASG_NAME:-counter-app-asg}"

OIDC_PROVIDER_URL="https://token.actions.githubusercontent.com"
OIDC_PROVIDER_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE_NAME}"
ECR_REPOSITORY_ARN="arn:aws:ecr:${AWS_REGION}:${AWS_ACCOUNT_ID}:repository/${ECR_REPOSITORY}"

echo "[OIDC] account: ${AWS_ACCOUNT_ID}"
echo "[OIDC] repository: ${GITHUB_REPOSITORY}"
echo "[OIDC] branch: ${GITHUB_BRANCH}"
echo "[OIDC] role: ${ROLE_ARN}"

if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_PROVIDER_ARN" >/dev/null 2>&1; then
  echo "[OIDC] provider already exists: ${OIDC_PROVIDER_ARN}"
else
  echo "[OIDC] creating provider: ${OIDC_PROVIDER_URL}"
  aws iam create-open-id-connect-provider \
    --url "$OIDC_PROVIDER_URL" \
    --client-id-list sts.amazonaws.com
fi

TRUST_POLICY_FILE="$(mktemp)"
PERMISSION_POLICY_FILE="$(mktemp)"
trap 'rm -f "$TRUST_POLICY_FILE" "$PERMISSION_POLICY_FILE"' EXIT

cat > "$TRUST_POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "${OIDC_PROVIDER_ARN}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_REPOSITORY}:ref:refs/heads/${GITHUB_BRANCH}"
        }
      }
    }
  ]
}
EOF

cat > "$PERMISSION_POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrLogin",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EcrPushPullCounterApp",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeRepositories",
        "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "${ECR_REPOSITORY_ARN}"
    },
    {
      "Sid": "RefreshCounterAppAsg",
      "Effect": "Allow",
      "Action": [
        "autoscaling:DescribeInstanceRefreshes",
        "autoscaling:StartInstanceRefresh"
      ],
      "Resource": "*"
    }
  ]
}
EOF

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "[OIDC] role already exists, updating trust policy"
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-document "file://${TRUST_POLICY_FILE}"
else
  echo "[OIDC] creating role"
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "file://${TRUST_POLICY_FILE}" \
    --description "Deploy counter-app from GitHub Actions using OIDC" \
    >/dev/null
fi

echo "[OIDC] attaching inline deploy policy"
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name counter-app-github-actions-deploy \
  --policy-document "file://${PERMISSION_POLICY_FILE}"

echo "[OIDC] done"
echo "[OIDC] role arn: ${ROLE_ARN}"
