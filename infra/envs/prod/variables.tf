variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "alert_sns_topic_name" {
  description = "SNS topic name used by CloudWatch alarms. Leave empty to create alarms without notification actions."
  type        = string
  default     = "counter-app-alerts"
}

variable "app_log_group_name" {
  description = "CloudWatch Logs log group for counter-app container stdout/stderr."
  type        = string
  default     = "/counter-app/prod/app"
}

variable "app_log_retention_days" {
  description = "Retention period for application logs in CloudWatch Logs."
  type        = number
  default     = 30
}

variable "ec2_instance_role_name" {
  description = "IAM role name used by the EC2 instance profile. Leave empty to skip attaching the CloudWatch Logs write policy."
  type        = string
  default     = "ec2-uni-demo-role"
}

variable "elasticache_cache_cluster_id" {
  description = "Optional ElastiCache cache cluster id for Redis/Valkey alarms, for example demo-caches-0001-001. Leave empty to skip Redis alarms."
  type        = string
  default     = ""
}
