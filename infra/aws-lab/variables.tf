variable "aws_region" {
  description = "AWS region for the LineWatchTO lab."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project tag used in AWS resource names."
  type        = string
  default     = "linewatch"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.project_name))
    error_message = "project_name must be 3-21 lowercase letters, numbers, or hyphens, starting with a letter."
  }
}

variable "environment" {
  description = "Environment tag/name for the lab resources."
  type        = string
  default     = "aws-lab"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.environment))
    error_message = "environment must be 3-21 lowercase letters, numbers, or hyphens, starting with a letter."
  }
}

variable "allowed_http_cidrs" {
  description = "CIDR blocks allowed to reach HTTP port 80. Use your current public IP as x.x.x.x/32 for owner-only access."
  type        = list(string)

  validation {
    condition     = length(var.allowed_http_cidrs) > 0
    error_message = "allowed_http_cidrs must include at least one IPv4 CIDR block."
  }

  validation {
    condition = alltrue([
      for cidr in var.allowed_http_cidrs :
      can(cidrhost(cidr, 0)) && can(regex("^[0-9]{1,3}(\\.[0-9]{1,3}){3}/[0-9]{1,2}$", cidr))
    ])
    error_message = "allowed_http_cidrs entries must be valid IPv4 CIDR blocks."
  }

  validation {
    condition = alltrue([
      for cidr in var.allowed_http_cidrs :
      try(!(cidrhost(cidr, 0) == "0.0.0.0" && tonumber(split("/", cidr)[1]) == 0), true)
    ])
    error_message = "allowed_http_cidrs must not include any IPv4 CIDR that covers all addresses."
  }
}

variable "instance_type" {
  description = "EC2 instance type. t4g.small is ARM64 and matches the production ARM64 images while keeping the lab small."
  type        = string
  default     = "t4g.small"

  validation {
    condition     = contains(["t4g.nano", "t4g.micro", "t4g.small", "t4g.medium"], var.instance_type)
    error_message = "instance_type must be one of t4g.nano, t4g.micro, t4g.small, or t4g.medium."
  }
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GiB. Keep small for cost control."
  type        = number
  default     = 16

  validation {
    condition     = var.root_volume_size_gb >= 12 && var.root_volume_size_gb <= 30
    error_message = "root_volume_size_gb must be between 12 and 30."
  }
}

variable "linewatch_image_registry" {
  description = "Container registry containing LineWatchTO images."
  type        = string
  default     = "ghcr.io/calebhabesh"
}

variable "linewatch_image_tag" {
  description = "Full 40-character Git SHA image tag to deploy."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.linewatch_image_tag))
    error_message = "linewatch_image_tag must be a full 40-character lowercase Git SHA."
  }
}

variable "postgres_password" {
  description = "Lab-only PostgreSQL password written to the EC2 env file. Do not reuse production secrets."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.postgres_password) >= 16
    error_message = "postgres_password must be at least 16 characters."
  }

  validation {
    condition     = can(regex("^[A-Za-z0-9_.:@+,=-]{16,}$", var.postgres_password))
    error_message = "postgres_password must be at least 16 characters and use only env-file-safe characters: letters, numbers, _, -, ., :, @, +, comma, or =."
  }
}

variable "autostop_schedule_expression" {
  description = "EventBridge schedule for stopping tagged lab EC2 instances. Default is 03:00 UTC daily."
  type        = string
  default     = "cron(0 3 * * ? *)"

  validation {
    condition     = can(regex("^(cron|rate)\\(.+\\)$", var.autostop_schedule_expression))
    error_message = "autostop_schedule_expression must start with cron( or rate( and end with )."
  }
}

variable "lambda_log_retention_days" {
  description = "CloudWatch retention for the auto-stop Lambda log group."
  type        = number
  default     = 7

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30], var.lambda_log_retention_days)
    error_message = "lambda_log_retention_days must be a valid CloudWatch retention value up to 30 days: 1, 3, 5, 7, 14, or 30."
  }
}

variable "artifact_retention_days" {
  description = "S3 lifecycle expiration for lab smoke/deployment artifacts."
  type        = number
  default     = 7

  validation {
    condition     = var.artifact_retention_days >= 1 && var.artifact_retention_days <= 30 && floor(var.artifact_retention_days) == var.artifact_retention_days
    error_message = "artifact_retention_days must be an integer between 1 and 30."
  }
}
