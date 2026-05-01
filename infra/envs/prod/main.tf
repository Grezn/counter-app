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

# ===== Existing ALB (imported) =====
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

# ===== Existing Target Group (imported) =====
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