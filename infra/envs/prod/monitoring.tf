# =========================
# Monitoring
# =========================

data "aws_sns_topic" "counter_app_alerts" {
  count = var.alert_sns_topic_name == "" ? 0 : 1
  name  = var.alert_sns_topic_name
}

locals {
  alarm_actions = var.alert_sns_topic_name == "" ? [] : [data.aws_sns_topic.counter_app_alerts[0].arn]

  alb_dimensions = {
    LoadBalancer = aws_lb.counter_app.arn_suffix
  }

  target_group_dimensions = {
    LoadBalancer = aws_lb.counter_app.arn_suffix
    TargetGroup  = aws_lb_target_group.counter_app.arn_suffix
  }
}

resource "aws_cloudwatch_log_group" "counter_app" {
  name              = var.app_log_group_name
  retention_in_days = var.app_log_retention_days
}

resource "aws_iam_role_policy" "counter_app_cloudwatch_logs" {
  count = var.ec2_instance_role_name == "" ? 0 : 1

  name = "counter-app-cloudwatch-logs"
  role = var.ec2_instance_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "WriteCounterAppContainerLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.counter_app.arn}:*"
      }
    ]
  })
}

resource "aws_cloudwatch_metric_alarm" "no_healthy_hosts" {
  alarm_name          = "counter-app-no-healthy-hosts"
  alarm_description   = "All counter-app target group hosts are unhealthy or unavailable."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  dimensions          = local.target_group_dimensions
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  alarm_name          = "counter-app-unhealthy-hosts"
  alarm_description   = "At least one counter-app target group host is unhealthy."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  dimensions          = local.target_group_dimensions
}

resource "aws_cloudwatch_metric_alarm" "target_5xx" {
  alarm_name          = "counter-app-target-5xx"
  alarm_description   = "The counter-app targets returned repeated 5xx responses."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  dimensions          = local.target_group_dimensions
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "counter-app-alb-5xx"
  alarm_description   = "The Application Load Balancer returned 5xx responses before reaching the app target."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  dimensions          = local.alb_dimensions
}

resource "aws_cloudwatch_metric_alarm" "ec2_status_check_failed" {
  alarm_name          = "counter-app-ec2-status-check-failed"
  alarm_description   = "One or more EC2 instances in the counter-app ASG failed EC2 status checks."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.counter_app.name
  }
}

resource "aws_cloudwatch_metric_alarm" "ec2_high_cpu" {
  alarm_name          = "counter-app-ec2-high-cpu"
  alarm_description   = "Average EC2 CPU in the counter-app ASG stayed high."
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 85
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.counter_app.name
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_engine_cpu" {
  count = var.elasticache_cache_cluster_id == "" ? 0 : 1

  alarm_name          = "counter-app-redis-engine-high-cpu"
  alarm_description   = "Redis/Valkey engine CPU stayed high."
  namespace           = "AWS/ElastiCache"
  metric_name         = "EngineCPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 80
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    CacheClusterId = var.elasticache_cache_cluster_id
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  count = var.elasticache_cache_cluster_id == "" ? 0 : 1

  alarm_name          = "counter-app-redis-memory-high"
  alarm_description   = "Redis/Valkey database memory usage stayed high."
  namespace           = "AWS/ElastiCache"
  metric_name         = "DatabaseMemoryUsagePercentage"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 85
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    CacheClusterId = var.elasticache_cache_cluster_id
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_evictions" {
  count = var.elasticache_cache_cluster_id == "" ? 0 : 1

  alarm_name          = "counter-app-redis-evictions"
  alarm_description   = "Redis/Valkey evicted keys, which can cause counter or visitor data loss."
  namespace           = "AWS/ElastiCache"
  metric_name         = "Evictions"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    CacheClusterId = var.elasticache_cache_cluster_id
  }
}

locals {
  cloudwatch_dashboard_widgets = concat(
    [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          region = var.aws_region
          title  = "Target group health"
          view   = "timeSeries"
          period = 60
          stat   = "Maximum"
          metrics = [
            ["AWS/ApplicationELB", "UnHealthyHostCount", "TargetGroup", aws_lb_target_group.counter_app.arn_suffix, "LoadBalancer", aws_lb.counter_app.arn_suffix, { label = "Unhealthy hosts", stat = "Maximum" }],
            [".", "HealthyHostCount", ".", ".", ".", ".", { label = "Healthy hosts", stat = "Minimum" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          region = var.aws_region
          title  = "HTTP 5xx"
          view   = "timeSeries"
          period = 300
          stat   = "Sum"
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "TargetGroup", aws_lb_target_group.counter_app.arn_suffix, "LoadBalancer", aws_lb.counter_app.arn_suffix, { label = "App target 5xx" }],
            [".", "HTTPCode_ELB_5XX_Count", "LoadBalancer", aws_lb.counter_app.arn_suffix, { label = "ALB 5xx" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          region = var.aws_region
          title  = "Latency and requests"
          view   = "timeSeries"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "TargetGroup", aws_lb_target_group.counter_app.arn_suffix, "LoadBalancer", aws_lb.counter_app.arn_suffix, { label = "p95 latency", stat = "p95", yAxis = "left" }],
            [".", "RequestCount", ".", ".", ".", ".", { label = "Requests", stat = "Sum", yAxis = "right" }],
          ]
          yAxis = {
            left = {
              label = "Seconds"
            }
            right = {
              label = "Count"
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          region = var.aws_region
          title  = "EC2 ASG"
          view   = "timeSeries"
          period = 300
          metrics = [
            ["AWS/EC2", "CPUUtilization", "AutoScalingGroupName", aws_autoscaling_group.counter_app.name, { label = "CPU avg", stat = "Average" }],
            [".", "StatusCheckFailed", ".", ".", { label = "Status check failed", stat = "Maximum", yAxis = "right" }],
          ]
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 12
        width  = 8
        height = 6
        properties = {
          region = var.aws_region
          title  = "Recent app 5xx logs"
          view   = "table"
          query  = "SOURCE '${aws_cloudwatch_log_group.counter_app.name}' | fields @timestamp, request_id, path, status, latency_ms, client_ip | filter status >= 500 | sort @timestamp desc | limit 20"
        }
      },
      {
        type   = "log"
        x      = 8
        y      = 12
        width  = 8
        height = 6
        properties = {
          region = var.aws_region
          title  = "Slow app requests"
          view   = "table"
          query  = "SOURCE '${aws_cloudwatch_log_group.counter_app.name}' | fields @timestamp, request_id, path, status, latency_ms, client_ip | filter latency_ms >= 1000 | sort latency_ms desc | limit 20"
        }
      },
      {
        type   = "log"
        x      = 16
        y      = 12
        width  = 8
        height = 6
        properties = {
          region = var.aws_region
          title  = "Top paths"
          view   = "table"
          query  = "SOURCE '${aws_cloudwatch_log_group.counter_app.name}' | filter ispresent(path) | stats count(*) as requests, pct(latency_ms, 95) as p95_ms by path, status | sort requests desc | limit 20"
        }
      },
    ],
    var.elasticache_cache_cluster_id == "" ? [] : [
      {
        type   = "metric"
        x      = 0
        y      = 18
        width  = 12
        height = 6
        properties = {
          region = var.aws_region
          title  = "Redis / Valkey"
          view   = "timeSeries"
          period = 300
          metrics = [
            ["AWS/ElastiCache", "EngineCPUUtilization", "CacheClusterId", var.elasticache_cache_cluster_id, { label = "Engine CPU", stat = "Average" }],
            [".", "DatabaseMemoryUsagePercentage", ".", ".", { label = "Memory used", stat = "Average" }],
            [".", "Evictions", ".", ".", { label = "Evictions", stat = "Sum", yAxis = "right" }],
          ]
        }
      }
    ]
  )
}

resource "aws_cloudwatch_dashboard" "counter_app_ops" {
  dashboard_name = "counter-app-ops"

  dashboard_body = jsonencode({
    widgets = local.cloudwatch_dashboard_widgets
  })
}

output "app_log_group_name" {
  value = aws_cloudwatch_log_group.counter_app.name
}

output "counter_app_dashboard_name" {
  value = aws_cloudwatch_dashboard.counter_app_ops.dashboard_name
}
