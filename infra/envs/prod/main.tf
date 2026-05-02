terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  vpc_id = "vpc-0e929ca22e398f512"
}

output "account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "region" {
  value = data.aws_region.current.name
}

# =========================
# ALB
# =========================
resource "aws_lb" "counter_app" {
  name               = "counter-app-alb"
  internal           = false
  load_balancer_type = "application"

  security_groups = ["sg-071602cd50cb138bc"]
  subnets = [
    "subnet-013ee08c32691e2cf",
    "subnet-08f75ba3284367f37",
    "subnet-0a844d612f61b1b92",
  ]

  lifecycle {
    prevent_destroy = true
  }
}

# =========================
# Target Group
# =========================
resource "aws_lb_target_group" "counter_app" {
  name        = "counter-app-tg"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = local.vpc_id
  target_type = "instance"

  health_check {
    enabled             = true
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  lifecycle {
    prevent_destroy = true
  }
}

# =========================
# Listener 80 -> 443 Redirect
# =========================
resource "aws_lb_listener" "http_80" {
  load_balancer_arn = aws_lb.counter_app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# =========================
# Listener 443 -> Forward TG
# =========================
resource "aws_lb_listener" "https_443" {
  load_balancer_arn = aws_lb.counter_app.arn
  port              = 443
  protocol          = "HTTPS"

  certificate_arn = "arn:aws:acm:us-east-1:131730003210:certificate/f517b2da-2ec6-41a1-872c-9aae3f13ce79"
  ssl_policy      = "ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.counter_app.arn
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [default_action]
  }
}

# =========================
# Launch Template (import existing)
# =========================
resource "aws_launch_template" "counter_app" {
  name                   = "counter-app-template"
  update_default_version = true

  lifecycle {
    prevent_destroy = true
    ignore_changes  = all
  }
}

# =========================
# Auto Scaling Group (import existing)
# =========================
resource "aws_autoscaling_group" "counter_app" {
  name                      = "counter-app-asg"
  min_size                  = 1
  max_size                  = 2
  desired_capacity          = 1
  health_check_type         = "ELB"
  health_check_grace_period = 300
  metrics_granularity       = "1Minute"

  target_group_arns = [
    "arn:aws:elasticloadbalancing:us-east-1:131730003210:targetgroup/counter-app-tg/337a14de9c9b122c"
  ]

  vpc_zone_identifier = [
    "subnet-013ee08c32691e2cf",
    "subnet-08f75ba3284367f37",
  ]

  launch_template {
    id      = aws_launch_template.counter_app.id
    version = "$Default"
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = all
  }
}