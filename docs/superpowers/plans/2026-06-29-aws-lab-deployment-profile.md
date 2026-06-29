# AWS Lab Deployment Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Terraform-managed, teardown-first AWS lab deployment for LineWatchTO using EC2, VPC, IAM, SSM, S3 artifacts, Lambda/EventBridge auto-stop, Docker Compose, and smoke-test documentation.

**Architecture:** The lab runs the existing containerized app on one small EC2 instance, using the same GHCR images and Compose service boundaries as production. Terraform owns AWS resources and outputs the lab URL, SSM command, S3 artifact bucket, and teardown guidance. Lambda/EventBridge provide a realistic AWS automation use case by stopping tagged lab instances on a schedule, while `terraform destroy` remains the primary cost-control workflow.

**Tech Stack:** Terraform, AWS provider, archive provider, EC2, VPC, IAM, SSM, S3, Lambda Python 3.12, EventBridge, Docker Compose, Caddy, Bash, Node smoke checker, Python unittest.

---

## File Structure

- Create `.env.aws-lab.example`: tracked lab env template with safe non-production values.
- Modify `.gitignore`: allow `.env.aws-lab.example` while keeping real `.env.aws-lab` ignored.
- Create `Caddyfile.aws-lab`: HTTP-only lab reverse proxy with actuator blocking and noindex headers.
- Create `docker-compose.aws-lab.yml`: app stack for EC2 using prebuilt GHCR images and no local builds.
- Create `infra/aws-lab/versions.tf`: Terraform/provider constraints.
- Create `infra/aws-lab/providers.tf`: AWS provider and default tags.
- Create `infra/aws-lab/variables.tf`: user-controlled region, CIDRs, instance type, image tag, auto-stop schedule, and lab config.
- Create `infra/aws-lab/main.tf`: VPC, subnet, security group, IAM, EC2, S3, Lambda, EventBridge.
- Create `infra/aws-lab/outputs.tf`: URL, instance ID, public IP, SSM command, S3 bucket, and smoke command.
- Create `infra/aws-lab/user_data.sh.tftpl`: EC2 bootstrap script that installs Docker, writes lab files, pulls images, and starts Compose.
- Create `infra/aws-lab/lambda/autostop.py`: Lambda handler that stops running tagged lab instances.
- Create `infra/aws-lab/terraform.tfvars.example`: copyable lab variable file.
- Create `infra/aws-lab/README.md`: AWS Console checklist, init/plan/apply/smoke/destroy, cost review, and troubleshooting.
- Create `scripts/lib/aws-lab.sh`: shared local helpers for Terraform output parsing and artifact writing.
- Create `scripts/aws-lab-smoke.sh`: smoke-check deployed lab and upload a small JSON result to S3.
- Create `scripts/tests/aws-lab-tools.test.sh`: shell tests for the AWS lab helper.
- Create `scripts/tests/aws_lab_autostop_test.py`: unit tests for the Lambda instance filtering logic.

## Scope Notes

- Do not run `terraform apply` during normal implementation verification. Running `apply` creates AWS resources and must be a deliberate user-approved live step.
- Do not add NAT Gateway, Elastic IP, ALB, RDS, ElastiCache, Route 53, CloudFront, ECS, or EKS.
- Do not commit `.env.aws-lab`, AWS credentials, Terraform state, or generated zip files.
- Keep production Oracle VPS docs intact except for an optional short cross-link to the AWS lab README.

---

### Task 1: AWS Lab Compose And Environment Files

**Files:**
- Modify: `.gitignore`
- Create: `.env.aws-lab.example`
- Create: `Caddyfile.aws-lab`
- Create: `docker-compose.aws-lab.yml`

- [ ] **Step 1: Allow only the tracked AWS lab env example and ignore Terraform local state**

Add the AWS lab exception near the existing env exceptions in `.gitignore`:

```gitignore
!.env.aws-lab.example
```

Add Terraform local-state ignores near the local tooling section:

```gitignore
# Terraform
**/.terraform/
*.tfstate
*.tfstate.*
crash.log
crash.*.log
```

- [ ] **Step 2: Add the AWS lab env template**

Create `.env.aws-lab.example` with this content:

```dotenv
# Copy this file to .env.aws-lab only if running Compose manually.
# Terraform user data writes a generated .env.aws-lab on EC2.
# Keep .env.aws-lab out of Git.

LINEWATCH_AWS_LAB_PUBLIC_ORIGIN=http://127.0.0.1
LINEWATCH_AWS_LAB_HTTP_PORT=8088

POSTGRES_DB=linewatch_aws_lab
POSTGRES_USER=linewatch_aws_lab
POSTGRES_PASSWORD=linewatch_aws_lab_example_password_2026

JAVA_TOOL_OPTIONS=-Xmx768m

LINEWATCH_AUTH_SECURE_COOKIE=false
LINEWATCH_AUTH_ALLOWED_ORIGINS=http://127.0.0.1,http://localhost:8088
LINEWATCH_AUTH_RATE_LIMIT_ENABLED=true
LINEWATCH_AUTH_RATE_LIMIT_WINDOW=PT15M
LINEWATCH_AUTH_RATE_LIMIT_AUTH_MAX_REQUESTS=12
LINEWATCH_AUTH_RATE_LIMIT_PASSWORD_RESET_MAX_REQUESTS=5
LINEWATCH_AUTH_RATE_LIMIT_DEMO_MAX_REQUESTS=20
LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=true
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=http://127.0.0.1

LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_ENABLED=false
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_FROM=
LINEWATCH_AUTH_GOOGLE_ENABLED=false
LINEWATCH_AUTH_GOOGLE_CLIENT_ID=
LINEWATCH_AUTH_GOOGLE_CLIENT_SECRET=
LINEWATCH_AUTH_GOOGLE_REDIRECT_URI=
LINEWATCH_AUTH_GOOGLE_JWK_SET_URI=https://www.googleapis.com/oauth2/v3/certs
LINEWATCH_AUTH_GOOGLE_AUTHORIZATION_URI=https://accounts.google.com/o/oauth2/v2/auth
LINEWATCH_AUTH_GOOGLE_TOKEN_URI=https://oauth2.googleapis.com/token

SPRING_MAIL_HOST=
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=
SPRING_MAIL_PASSWORD=
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true

LINEWATCH_INGESTION_ALERTS_ENABLED=false
LINEWATCH_INGESTION_ALERTS_URL=https://alerts.ttc.ca/api/alerts/live-alerts
LINEWATCH_INGESTION_ALERTS_FIXED_DELAY=PT30S
LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE=PT6M
LINEWATCH_INGESTION_ALERTS_CONNECT_TIMEOUT=PT3S
LINEWATCH_INGESTION_ALERTS_READ_TIMEOUT=PT8S
LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_ENABLED=false
LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_URL=https://gtfsrt.ttc.ca/alerts/all?format=text

LINEWATCH_ARRIVALS_ENABLED=true
LINEWATCH_ARRIVALS_PROVIDER=scheduled
LINEWATCH_ARRIVALS_SCHEDULE_HORIZON=PT90M
LINEWATCH_ARRIVALS_MAX_ARRIVALS_PER_LINE=4
LINEWATCH_ARRIVALS_GTFS_IMPORT_ENABLED=false
LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=false
LINEWATCH_ARRIVALS_GTFS_REFRESH_PACKAGE_URL=https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=merged-gtfs-ttc-routes-and-schedules
LINEWATCH_ARRIVALS_GTFS_REFRESH_INITIAL_DELAY=PT30S
LINEWATCH_ARRIVALS_GTFS_REFRESH_FIXED_DELAY=PT24H
LINEWATCH_ARRIVALS_GTFS_REFRESH_MIN_SERVICE_DAYS_REMAINING=14
LINEWATCH_ARRIVALS_GTFS_PROMOTION_INITIAL_DELAY=PT30S
LINEWATCH_ARRIVALS_GTFS_PROMOTION_FIXED_DELAY=PT5M

LINEWATCH_PERFORMANCE_TTC_ENABLED=false
LINEWATCH_PERFORMANCE_TTC_URL=https://www.ttc.ca/
LINEWATCH_PERFORMANCE_TTC_CONNECT_TIMEOUT=PT3S
LINEWATCH_PERFORMANCE_TTC_READ_TIMEOUT=PT8S
LINEWATCH_PERFORMANCE_TTC_REFRESH_INTERVAL=PT24H
LINEWATCH_PERFORMANCE_TTC_MAX_AGE=PT48H

LINEWATCH_CACHE_DASHBOARD_ENABLED=true
LINEWATCH_CACHE_DASHBOARD_STATUS_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_MAP_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_ALERTS_TTL=PT15S
LINEWATCH_CACHE_DASHBOARD_INGESTION_HEALTH_TTL=PT15S
LINEWATCH_CACHE_DASHBOARD_PERFORMANCE_TTL=PT6H

LINEWATCH_PUSH_ENABLED=false
LINEWATCH_PUSH_VAPID_PUBLIC_KEY=
LINEWATCH_PUSH_VAPID_PRIVATE_KEY=
LINEWATCH_PUSH_VAPID_SUBJECT=mailto:hostmaster@linewatchto.ca
LINEWATCH_PUSH_EVALUATION_DELAY_MS=30000
LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION=PT24H

LINEWATCH_ENVIRONMENT=aws-lab
LINEWATCH_OBSERVABILITY_ENABLED=false
LINEWATCH_OBSERVABILITY_HOST=aws-lab-ec2
LINEWATCH_OBSERVABILITY_COMPOSE_PROJECT=linewatch-aws-lab

GRAFANA_CLOUD_PROMETHEUS_REMOTE_WRITE_URL=
GRAFANA_CLOUD_PROMETHEUS_USERNAME=
GRAFANA_CLOUD_LOKI_URL=
GRAFANA_CLOUD_LOKI_USERNAME=
GRAFANA_CLOUD_API_TOKEN=

NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=

LINEWATCH_FEEDBACK_ENABLED=false
LINEWATCH_FEEDBACK_FROM=
LINEWATCH_FEEDBACK_TO=
LINEWATCH_FEEDBACK_RATE_LIMIT_MAX_REQUESTS=5
LINEWATCH_FEEDBACK_RATE_LIMIT_WINDOW=PT15M
NEXT_PUBLIC_LINEWATCH_SUPPORT_URL=
```

- [ ] **Step 3: Add the AWS lab Caddyfile**

Create `Caddyfile.aws-lab`:

```caddyfile
{
	auto_https off
}

(linewatch_aws_lab_security_headers) {
	header {
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy strict-origin-when-cross-origin
		X-Robots-Tag "noindex, nofollow, noarchive"
	}
}

(linewatch_cache_headers) {
	@linewatch_static_cache {
		path /_next/static/* /assets/*
	}
	header @linewatch_static_cache Cache-Control "public, max-age=31536000, immutable" {
		defer
	}

	@linewatch_public_api_cache {
		path /api/dashboard /api/status /api/map /api/alerts /api/performance /api/accessibility-outages /api/surface-notices
	}
	header @linewatch_public_api_cache Cache-Control "public, max-age=15, s-maxage=30, stale-while-revalidate=30" {
		defer
	}

	@linewatch_private_api_no_store {
		path /api/auth/* /api/account/* /api/feedback /api/health* /api/actuator*
	}
	header @linewatch_private_api_no_store Cache-Control "no-store" {
		defer
	}
}

:8080 {
	encode gzip zstd
	import linewatch_aws_lab_security_headers
	import linewatch_cache_headers

	handle /actuator* {
		respond 404
	}

	handle /api/* {
		reverse_proxy backend:8080
	}

	handle {
		reverse_proxy frontend:3000
	}
}
```

- [ ] **Step 4: Add the AWS lab Compose file**

Create `docker-compose.aws-lab.yml`:

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "2"

services:
  postgres:
    image: ${LINEWATCH_IMAGE_REGISTRY:-ghcr.io/calebhabesh}/linewatch-postgres:${LINEWATCH_IMAGE_TAG:?Set LINEWATCH_IMAGE_TAG in .env.release}
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-linewatch_aws_lab}
      POSTGRES_USER: ${POSTGRES_USER:-linewatch_aws_lab}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env.aws-lab}
    volumes:
      - postgres_aws_lab_data:/var/lib/postgresql/data
    networks:
      - linewatch-aws-lab-net
    logging: *default-logging
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \"$$POSTGRES_USER\" -d \"$$POSTGRES_DB\""]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_aws_lab_data:/data
    networks:
      - linewatch-aws-lab-net
    logging: *default-logging
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    image: ${LINEWATCH_IMAGE_REGISTRY:-ghcr.io/calebhabesh}/linewatch-backend:${LINEWATCH_IMAGE_TAG:?Set LINEWATCH_IMAGE_TAG in .env.release}
    restart: unless-stopped
    env_file:
      - ${LINEWATCH_AWS_LAB_ENV_FILE:-.env.aws-lab}
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB:-linewatch_aws_lab}
      SPRING_DATASOURCE_USERNAME: ${POSTGRES_USER:-linewatch_aws_lab}
      SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env.aws-lab}
      SPRING_DATA_REDIS_HOST: redis
      SPRING_DATA_REDIS_PORT: 6379
      SERVER_PORT: 8080
      MANAGEMENT_SERVER_PORT: 9090
      LINEWATCH_ENVIRONMENT: ${LINEWATCH_ENVIRONMENT:-aws-lab}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - linewatch-aws-lab-net
    logging: *default-logging
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8080/api/health >/dev/null"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 60s

  frontend:
    image: ${LINEWATCH_IMAGE_REGISTRY:-ghcr.io/calebhabesh}/linewatch-frontend:${LINEWATCH_IMAGE_TAG:?Set LINEWATCH_IMAGE_TAG in .env.release}
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      BACKEND_URL: http://backend:8080
      LINEWATCH_BACKEND_URL: http://backend:8080
      NEXT_TELEMETRY_DISABLED: 1
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - linewatch-aws-lab-net
    logging: *default-logging
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "node -e \"fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""
        ]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 45s

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "${LINEWATCH_AWS_LAB_HTTP_PORT:-80}:8080"
    volumes:
      - ./Caddyfile.aws-lab:/etc/caddy/Caddyfile:ro
      - caddy_aws_lab_data:/data
      - caddy_aws_lab_config:/config
    depends_on:
      frontend:
        condition: service_healthy
      backend:
        condition: service_healthy
    networks:
      - linewatch-aws-lab-net
    logging: *default-logging
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/api/health >/dev/null"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 15s

volumes:
  postgres_aws_lab_data:
  redis_aws_lab_data:
  caddy_aws_lab_data:
  caddy_aws_lab_config:

networks:
  linewatch-aws-lab-net:
    driver: bridge
```

- [ ] **Step 5: Verify Compose renders without building**

Create a temporary release env and validate:

```bash
tmp_release="$(mktemp)"
printf '%s\n' \
  'LINEWATCH_IMAGE_REGISTRY=ghcr.io/calebhabesh' \
  'LINEWATCH_IMAGE_TAG=0123456789abcdef0123456789abcdef01234567' > "$tmp_release"
docker compose \
  --env-file .env.aws-lab.example \
  --env-file "$tmp_release" \
  -f docker-compose.aws-lab.yml \
  config >/tmp/linewatch-aws-lab-compose.yml
rm -f "$tmp_release"
```

Expected: command exits `0`, and `/tmp/linewatch-aws-lab-compose.yml` contains no `build:` entries.

- [ ] **Step 6: Commit Task 1**

```bash
git add .gitignore .env.aws-lab.example Caddyfile.aws-lab docker-compose.aws-lab.yml
git commit -m "feat(infra): add aws lab compose profile"
```

---

### Task 2: Lambda Auto-Stop Code And Tests

**Files:**
- Create: `infra/aws-lab/lambda/autostop.py`
- Create: `scripts/tests/aws_lab_autostop_test.py`

- [ ] **Step 1: Write the Lambda unit tests first**

Create `scripts/tests/aws_lab_autostop_test.py`:

```python
#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "infra" / "aws-lab" / "lambda" / "autostop.py"

spec = importlib.util.spec_from_file_location("linewatch_aws_lab_autostop", MODULE_PATH)
autostop = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(autostop)


class FakePaginator:
    def __init__(self, pages):
        self.pages = pages

    def paginate(self, **kwargs):
        self.kwargs = kwargs
        return self.pages


class FakeEc2:
    def __init__(self, pages):
        self.paginator = FakePaginator(pages)
        self.stopped = []

    def get_paginator(self, name):
        assert name == "describe_instances"
        return self.paginator

    def stop_instances(self, InstanceIds):
        self.stopped.extend(InstanceIds)
        return {"StoppingInstances": [{"InstanceId": instance_id} for instance_id in InstanceIds]}


class AutoStopTest(unittest.TestCase):
    def test_finds_only_running_lab_instances(self):
        ec2 = FakeEc2([
            {
                "Reservations": [
                    {
                        "Instances": [
                            {
                                "InstanceId": "i-running-lab",
                                "State": {"Name": "running"},
                                "Tags": [{"Key": "LineWatchAwsLab", "Value": "true"}],
                            },
                            {
                                "InstanceId": "i-stopped-lab",
                                "State": {"Name": "stopped"},
                                "Tags": [{"Key": "LineWatchAwsLab", "Value": "true"}],
                            },
                            {
                                "InstanceId": "i-running-other",
                                "State": {"Name": "running"},
                                "Tags": [{"Key": "LineWatchAwsLab", "Value": "false"}],
                            },
                        ]
                    }
                ]
            }
        ])

        result = autostop.find_running_lab_instances(ec2, "LineWatchAwsLab", "true")

        self.assertEqual(result, ["i-running-lab"])

    def test_stops_found_instances(self):
        ec2 = FakeEc2([])

        result = autostop.stop_instances(ec2, ["i-1", "i-2"])

        self.assertEqual(ec2.stopped, ["i-1", "i-2"])
        self.assertEqual(result["count"], 2)
        self.assertEqual(result["stopped"], ["i-1", "i-2"])

    def test_noop_when_no_instances_found(self):
        ec2 = FakeEc2([])

        result = autostop.stop_instances(ec2, [])

        self.assertEqual(ec2.stopped, [])
        self.assertEqual(result["count"], 0)
        self.assertEqual(result["stopped"], [])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the failing Lambda tests**

```bash
python3 scripts/tests/aws_lab_autostop_test.py
```

Expected: failure because `infra/aws-lab/lambda/autostop.py` does not exist.

- [ ] **Step 3: Implement the Lambda handler**

Create `infra/aws-lab/lambda/autostop.py`:

```python
import os
from typing import Any


def find_running_lab_instances(ec2: Any, tag_key: str, tag_value: str) -> list[str]:
    paginator = ec2.get_paginator("describe_instances")
    pages = paginator.paginate(
        Filters=[
            {"Name": f"tag:{tag_key}", "Values": [tag_value]},
            {"Name": "instance-state-name", "Values": ["running"]},
        ]
    )

    instance_ids: list[str] = []
    for page in pages:
        for reservation in page.get("Reservations", []):
            for instance in reservation.get("Instances", []):
                if instance.get("State", {}).get("Name") == "running":
                    instance_ids.append(instance["InstanceId"])
    return instance_ids


def stop_instances(ec2: Any, instance_ids: list[str]) -> dict[str, Any]:
    if not instance_ids:
        return {"count": 0, "stopped": []}

    ec2.stop_instances(InstanceIds=instance_ids)
    return {"count": len(instance_ids), "stopped": instance_ids}


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    import boto3

    tag_key = os.environ.get("TAG_KEY", "LineWatchAwsLab")
    tag_value = os.environ.get("TAG_VALUE", "true")

    ec2 = boto3.client("ec2")
    instance_ids = find_running_lab_instances(ec2, tag_key, tag_value)
    result = stop_instances(ec2, instance_ids)
    result["tag_key"] = tag_key
    result["tag_value"] = tag_value
    return result
```

- [ ] **Step 4: Run Lambda tests to pass**

```bash
python3 scripts/tests/aws_lab_autostop_test.py
```

Expected: `OK`.

- [ ] **Step 5: Commit Task 2**

```bash
git add infra/aws-lab/lambda/autostop.py scripts/tests/aws_lab_autostop_test.py
git commit -m "feat(infra): add aws lab auto-stop lambda"
```

---

### Task 3: Terraform AWS Lab Module

**Files:**
- Create: `infra/aws-lab/versions.tf`
- Create: `infra/aws-lab/providers.tf`
- Create: `infra/aws-lab/variables.tf`
- Create: `infra/aws-lab/main.tf`
- Create: `infra/aws-lab/outputs.tf`
- Create: `infra/aws-lab/user_data.sh.tftpl`
- Create: `infra/aws-lab/terraform.tfvars.example`

- [ ] **Step 1: Add Terraform/provider constraints**

Create `infra/aws-lab/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }

    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}
```

- [ ] **Step 2: Add provider configuration**

Create `infra/aws-lab/providers.tf`:

```hcl
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      CostProfile = "ephemeral-lab"
    }
  }
}
```

- [ ] **Step 3: Add variables**

Create `infra/aws-lab/variables.tf`:

```hcl
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
}

variable "instance_type" {
  description = "EC2 instance type. t4g.small is ARM64 and matches the production ARM64 images while keeping the lab small."
  type        = string
  default     = "t4g.small"
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
}

variable "autostop_schedule_expression" {
  description = "EventBridge schedule for stopping tagged lab EC2 instances. Default is 03:00 UTC daily."
  type        = string
  default     = "cron(0 3 * * ? *)"
}

variable "lambda_log_retention_days" {
  description = "CloudWatch retention for the auto-stop Lambda log group."
  type        = number
  default     = 7
}

variable "artifact_retention_days" {
  description = "S3 lifecycle expiration for lab smoke/deployment artifacts."
  type        = number
  default     = 7
}
```

- [ ] **Step 4: Add the Terraform resources**

Create `infra/aws-lab/main.tf`:

```hcl
data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "ubuntu_arm64" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  lab_tag_key = "LineWatchAwsLab"

  common_tags = {
    Project          = var.project_name
    Environment      = var.environment
    LineWatchAwsLab  = "true"
    CostProfile      = "ephemeral-lab"
    TerraformRoot    = "infra/aws-lab"
    ProductionSystem = "false"
  }
}

resource "aws_vpc" "lab" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "lab" {
  vpc_id = aws_vpc.lab.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.lab.id
  cidr_block              = "10.42.1.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-a"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.lab.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.lab.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "lab" {
  name        = "${local.name_prefix}-sg"
  description = "HTTP-only access for the LineWatchTO AWS lab"
  vpc_id      = aws_vpc.lab.id

  dynamic "ingress" {
    for_each = var.allowed_http_cidrs
    content {
      description = "Lab HTTP access"
      from_port   = 80
      to_port     = 80
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    description = "Outbound internet for package install, image pulls, and SSM"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-sg"
  })
}

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "${local.name_prefix}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name_prefix}-instance-profile"
  role = aws_iam_role.ec2.name

  tags = local.common_tags
}

resource "aws_s3_bucket" "artifacts" {
  bucket_prefix = "${local.name_prefix}-artifacts-"
  force_destroy = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-artifacts"
  })
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-lab-artifacts"
    status = "Enabled"

    filter {
      prefix = ""
    }

    expiration {
      days = var.artifact_retention_days
    }
  }
}

resource "aws_instance" "lab" {
  ami                         = data.aws_ami.ubuntu_arm64.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.lab.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  associate_public_ip_address = true
  user_data_replace_on_change = true

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    compose_file              = file("${path.module}/../../docker-compose.aws-lab.yml")
    caddyfile                 = file("${path.module}/../../Caddyfile.aws-lab")
    linewatch_image_registry  = var.linewatch_image_registry
    linewatch_image_tag       = var.linewatch_image_tag
    postgres_password         = var.postgres_password
    artifact_bucket           = aws_s3_bucket.artifacts.bucket
  })

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gb
    encrypted             = true
    delete_on_termination = true
  }

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-ec2"
    AutoStop = "true"
  })
}

data "archive_file" "autostop" {
  type        = "zip"
  source_file = "${path.module}/lambda/autostop.py"
  output_path = "${path.module}/.terraform/autostop.zip"
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name_prefix}-autostop-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.name_prefix}-autostop"
  retention_in_days = var.lambda_log_retention_days

  tags = local.common_tags
}

data "aws_iam_policy_document" "lambda_policy" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lambda.arn}:*"]
  }

  statement {
    sid       = "DescribeInstances"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }

  statement {
    sid       = "StopTaggedLabInstances"
    actions   = ["ec2:StopInstances"]
    resources = ["arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/${local.lab_tag_key}"
      values   = ["true"]
    }
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${local.name_prefix}-autostop-policy"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_policy.json
}

resource "aws_lambda_function" "autostop" {
  function_name    = "${local.name_prefix}-autostop"
  filename         = data.archive_file.autostop.output_path
  source_code_hash = data.archive_file.autostop.output_base64sha256
  role             = aws_iam_role.lambda.arn
  handler          = "autostop.handler"
  runtime          = "python3.12"
  timeout          = 30

  environment {
    variables = {
      TAG_KEY   = local.lab_tag_key
      TAG_VALUE = "true"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.lambda,
  ]

  tags = local.common_tags
}

resource "aws_cloudwatch_event_rule" "autostop" {
  name                = "${local.name_prefix}-autostop"
  description         = "Stops LineWatchTO AWS lab EC2 instances on a schedule"
  schedule_expression = var.autostop_schedule_expression

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "autostop" {
  rule      = aws_cloudwatch_event_rule.autostop.name
  target_id = "linewatch-aws-lab-autostop"
  arn       = aws_lambda_function.autostop.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.autostop.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.autostop.arn
}
```

- [ ] **Step 5: Add outputs**

Create `infra/aws-lab/outputs.tf`:

```hcl
output "instance_id" {
  description = "EC2 instance ID for the LineWatchTO AWS lab."
  value       = aws_instance.lab.id
}

output "public_ip" {
  description = "Temporary public IPv4 address. Public IPv4 can incur hourly charges while allocated."
  value       = aws_instance.lab.public_ip
}

output "http_url" {
  description = "HTTP URL for the lab deployment."
  value       = "http://${aws_instance.lab.public_ip}"
}

output "artifact_bucket" {
  description = "S3 bucket for short-lived lab smoke/deployment artifacts."
  value       = aws_s3_bucket.artifacts.bucket
}

output "ssm_start_session_command" {
  description = "Command for SSM shell access without public SSH."
  value       = "aws ssm start-session --region ${var.aws_region} --target ${aws_instance.lab.id}"
}

output "smoke_command" {
  description = "Repository command to smoke-check the lab deployment."
  value       = "scripts/aws-lab-smoke.sh"
}
```

- [ ] **Step 6: Add EC2 bootstrap template**

Create `infra/aws-lab/user_data.sh.tftpl`:

```bash
#!/usr/bin/env bash
set -euxo pipefail

exec > >(tee /var/log/linewatch-aws-lab-bootstrap.log | logger -t linewatch-aws-lab-bootstrap -s 2>/dev/console) 2>&1

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$(dpkg --print-architecture)" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

mkdir -p /opt/linewatch/aws-lab
cd /opt/linewatch/aws-lab

cat > docker-compose.aws-lab.yml <<'COMPOSE'
${compose_file}
COMPOSE

cat > Caddyfile.aws-lab <<'CADDY'
${caddyfile}
CADDY

cat > .env.release <<'RELEASE'
LINEWATCH_IMAGE_REGISTRY=${linewatch_image_registry}
LINEWATCH_IMAGE_TAG=${linewatch_image_tag}
RELEASE

TOKEN="$(curl -fsS -X PUT 'http://169.254.169.254/latest/api/token' -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')"
PUBLIC_IPV4="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" 'http://169.254.169.254/latest/meta-data/public-ipv4')"
PUBLIC_ORIGIN="http://$PUBLIC_IPV4"

cat > .env.aws-lab <<EOF
LINEWATCH_AWS_LAB_PUBLIC_ORIGIN=$PUBLIC_ORIGIN
LINEWATCH_AWS_LAB_HTTP_PORT=80
POSTGRES_DB=linewatch_aws_lab
POSTGRES_USER=linewatch_aws_lab
POSTGRES_PASSWORD=${postgres_password}
JAVA_TOOL_OPTIONS=-Xmx768m
LINEWATCH_AUTH_SECURE_COOKIE=false
LINEWATCH_AUTH_ALLOWED_ORIGINS=$PUBLIC_ORIGIN
LINEWATCH_AUTH_RATE_LIMIT_ENABLED=true
LINEWATCH_AUTH_RATE_LIMIT_WINDOW=PT15M
LINEWATCH_AUTH_RATE_LIMIT_AUTH_MAX_REQUESTS=12
LINEWATCH_AUTH_RATE_LIMIT_PASSWORD_RESET_MAX_REQUESTS=5
LINEWATCH_AUTH_RATE_LIMIT_DEMO_MAX_REQUESTS=20
LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=true
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=$PUBLIC_ORIGIN
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_ENABLED=false
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_FROM=
LINEWATCH_AUTH_GOOGLE_ENABLED=false
LINEWATCH_AUTH_GOOGLE_CLIENT_ID=
LINEWATCH_AUTH_GOOGLE_CLIENT_SECRET=
LINEWATCH_AUTH_GOOGLE_REDIRECT_URI=
LINEWATCH_AUTH_GOOGLE_JWK_SET_URI=https://www.googleapis.com/oauth2/v3/certs
LINEWATCH_AUTH_GOOGLE_AUTHORIZATION_URI=https://accounts.google.com/o/oauth2/v2/auth
LINEWATCH_AUTH_GOOGLE_TOKEN_URI=https://oauth2.googleapis.com/token
SPRING_MAIL_HOST=
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=
SPRING_MAIL_PASSWORD=
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true
LINEWATCH_INGESTION_ALERTS_ENABLED=false
LINEWATCH_INGESTION_ALERTS_URL=https://alerts.ttc.ca/api/alerts/live-alerts
LINEWATCH_INGESTION_ALERTS_FIXED_DELAY=PT30S
LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE=PT6M
LINEWATCH_INGESTION_ALERTS_CONNECT_TIMEOUT=PT3S
LINEWATCH_INGESTION_ALERTS_READ_TIMEOUT=PT8S
LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_ENABLED=false
LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_URL=https://gtfsrt.ttc.ca/alerts/all?format=text
LINEWATCH_ARRIVALS_ENABLED=true
LINEWATCH_ARRIVALS_PROVIDER=scheduled
LINEWATCH_ARRIVALS_SCHEDULE_HORIZON=PT90M
LINEWATCH_ARRIVALS_MAX_ARRIVALS_PER_LINE=4
LINEWATCH_ARRIVALS_GTFS_IMPORT_ENABLED=false
LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=false
LINEWATCH_ARRIVALS_GTFS_REFRESH_PACKAGE_URL=https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=merged-gtfs-ttc-routes-and-schedules
LINEWATCH_ARRIVALS_GTFS_REFRESH_INITIAL_DELAY=PT30S
LINEWATCH_ARRIVALS_GTFS_REFRESH_FIXED_DELAY=PT24H
LINEWATCH_ARRIVALS_GTFS_REFRESH_MIN_SERVICE_DAYS_REMAINING=14
LINEWATCH_ARRIVALS_GTFS_PROMOTION_INITIAL_DELAY=PT30S
LINEWATCH_ARRIVALS_GTFS_PROMOTION_FIXED_DELAY=PT5M
LINEWATCH_PERFORMANCE_TTC_ENABLED=false
LINEWATCH_PERFORMANCE_TTC_URL=https://www.ttc.ca/
LINEWATCH_PERFORMANCE_TTC_CONNECT_TIMEOUT=PT3S
LINEWATCH_PERFORMANCE_TTC_READ_TIMEOUT=PT8S
LINEWATCH_PERFORMANCE_TTC_REFRESH_INTERVAL=PT24H
LINEWATCH_PERFORMANCE_TTC_MAX_AGE=PT48H
LINEWATCH_CACHE_DASHBOARD_ENABLED=true
LINEWATCH_CACHE_DASHBOARD_STATUS_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_MAP_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_ALERTS_TTL=PT15S
LINEWATCH_CACHE_DASHBOARD_INGESTION_HEALTH_TTL=PT15S
LINEWATCH_CACHE_DASHBOARD_PERFORMANCE_TTL=PT6H
LINEWATCH_PUSH_ENABLED=false
LINEWATCH_PUSH_VAPID_PUBLIC_KEY=
LINEWATCH_PUSH_VAPID_PRIVATE_KEY=
LINEWATCH_PUSH_VAPID_SUBJECT=mailto:hostmaster@linewatchto.ca
LINEWATCH_PUSH_EVALUATION_DELAY_MS=30000
LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION=PT24H
LINEWATCH_ENVIRONMENT=aws-lab
LINEWATCH_OBSERVABILITY_ENABLED=false
LINEWATCH_OBSERVABILITY_HOST=aws-lab-ec2
LINEWATCH_OBSERVABILITY_COMPOSE_PROJECT=linewatch-aws-lab
GRAFANA_CLOUD_PROMETHEUS_REMOTE_WRITE_URL=
GRAFANA_CLOUD_PROMETHEUS_USERNAME=
GRAFANA_CLOUD_LOKI_URL=
GRAFANA_CLOUD_LOKI_USERNAME=
GRAFANA_CLOUD_API_TOKEN=
NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=
LINEWATCH_FEEDBACK_ENABLED=false
LINEWATCH_FEEDBACK_FROM=
LINEWATCH_FEEDBACK_TO=
LINEWATCH_FEEDBACK_RATE_LIMIT_MAX_REQUESTS=5
LINEWATCH_FEEDBACK_RATE_LIMIT_WINDOW=PT15M
NEXT_PUBLIC_LINEWATCH_SUPPORT_URL=
EOF

chmod 600 .env.aws-lab .env.release

docker compose \
  --env-file .env.aws-lab \
  --env-file .env.release \
  -f docker-compose.aws-lab.yml \
  pull

docker compose \
  --env-file .env.aws-lab \
  --env-file .env.release \
  -f docker-compose.aws-lab.yml \
  up -d --no-build --remove-orphans --wait --wait-timeout 360

cat > /opt/linewatch/aws-lab/deployment-summary.txt <<EOF
LineWatchTO AWS lab deployed at $PUBLIC_ORIGIN
Image tag: ${linewatch_image_tag}
Artifact bucket: ${artifact_bucket}
EOF
```

- [ ] **Step 7: Add tfvars example**

Create `infra/aws-lab/terraform.tfvars.example`:

```hcl
aws_region = "us-east-1"

# Replace with your current public IP as a /32 before applying:
#   curl https://checkip.amazonaws.com
allowed_http_cidrs = ["203.0.113.10/32"]

# ARM64 instance to match the existing production GHCR image platform.
instance_type = "t4g.small"

# Replace with a pushed full Git SHA that exists in GHCR.
linewatch_image_tag = "0123456789abcdef0123456789abcdef01234567"

# Lab-only password. Do not reuse production secrets.
postgres_password = "linewatch-aws-lab-example-password-2026"

autostop_schedule_expression = "cron(0 3 * * ? *)"
artifact_retention_days       = 7
lambda_log_retention_days     = 7
```

- [ ] **Step 8: Format Terraform**

```bash
terraform -chdir=infra/aws-lab fmt
```

Expected: exits `0` and may rewrite `.tf` formatting.

- [ ] **Step 9: Validate Terraform without creating resources**

```bash
terraform -chdir=infra/aws-lab init -backend=false
terraform -chdir=infra/aws-lab validate
```

Expected: provider plugins install, then `Success! The configuration is valid.` If network sandbox blocks provider install, rerun with approval or report the exact failure.

- [ ] **Step 10: Commit Task 3**

```bash
git add infra/aws-lab
git commit -m "feat(infra): add aws lab terraform module"
```

---

### Task 4: AWS Lab Smoke Script And Helper Tests

**Files:**
- Create: `scripts/lib/aws-lab.sh`
- Create: `scripts/aws-lab-smoke.sh`
- Create: `scripts/tests/aws-lab-tools.test.sh`

- [ ] **Step 1: Write shell helper tests first**

Create `scripts/tests/aws-lab-tools.test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/lib/aws-lab.sh"

TEST_TMP="$(mktemp -d)"
TEST_COUNT=0

cleanup() {
  rm -rf "$TEST_TMP"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  return 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain: $needle"
}

assert_equals() {
  local actual="$1"
  local expected="$2"
  [[ "$actual" == "$expected" ]] || fail "expected '$expected', got '$actual'"
}

run_test() {
  local name="$1"
  local status
  shift

  set +e
  (
    set -e
    "$@"
  )
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    TEST_COUNT=$((TEST_COUNT + 1))
    printf 'PASS: %s\n' "$name"
  else
    return 1
  fi
}

test_output_value_reads_string_values() {
  local json
  json='{"http_url":{"value":"http://198.51.100.10"},"artifact_bucket":{"value":"linewatch-aws-lab-artifacts-demo"}}'

  assert_equals "$(linewatch_aws_lab_output_value "$json" http_url)" "http://198.51.100.10"
  assert_equals "$(linewatch_aws_lab_output_value "$json" artifact_bucket)" "linewatch-aws-lab-artifacts-demo"
}

test_output_value_fails_for_missing_key() {
  local output
  local status
  local json
  json='{"http_url":{"value":"http://198.51.100.10"}}'

  set +e
  output="$(linewatch_aws_lab_output_value "$json" artifact_bucket 2>&1)"
  status=$?
  set -e

  assert_equals "$status" "1"
  assert_contains "$output" "missing Terraform output: artifact_bucket"
}

test_artifact_json_contains_status_and_origin() {
  local artifact
  artifact="$TEST_TMP/artifact.json"

  linewatch_aws_lab_write_smoke_artifact "$artifact" "http://198.51.100.10" "passed"

  assert_contains "$(cat "$artifact")" '"origin": "http://198.51.100.10"'
  assert_contains "$(cat "$artifact")" '"status": "passed"'
}

run_test "output value reads strings" test_output_value_reads_string_values
run_test "output value fails for missing key" test_output_value_fails_for_missing_key
run_test "artifact json contains status and origin" test_artifact_json_contains_status_and_origin

printf 'Completed %d aws lab tool tests.\n' "$TEST_COUNT"
```

- [ ] **Step 2: Run the failing helper tests**

```bash
bash scripts/tests/aws-lab-tools.test.sh
```

Expected: failure because `scripts/lib/aws-lab.sh` does not exist.

- [ ] **Step 3: Add AWS lab helper functions**

Create `scripts/lib/aws-lab.sh`:

```bash
#!/usr/bin/env bash

linewatch_aws_lab_die() {
  printf 'Error: %s\n' "$*" >&2
  return 1
}

linewatch_aws_lab_root_dir() {
  local source_dir
  source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  printf '%s\n' "$source_dir"
}

linewatch_aws_lab_terraform_dir() {
  local root_dir
  root_dir="${LINEWATCH_ROOT_DIR:-$(linewatch_aws_lab_root_dir)}"
  printf '%s\n' "$root_dir/infra/aws-lab"
}

linewatch_aws_lab_output_json() {
  local terraform_dir
  terraform_dir="${LINEWATCH_AWS_LAB_TERRAFORM_DIR:-$(linewatch_aws_lab_terraform_dir)}"
  terraform -chdir="$terraform_dir" output -json
}

linewatch_aws_lab_output_value() {
  local json="${1:?json is required}"
  local key="${2:?key is required}"

  LINEWATCH_AWS_LAB_OUTPUT_JSON="$json" LINEWATCH_AWS_LAB_OUTPUT_KEY="$key" \
    node -e '
const data = JSON.parse(process.env.LINEWATCH_AWS_LAB_OUTPUT_JSON || "{}");
const key = process.env.LINEWATCH_AWS_LAB_OUTPUT_KEY;
if (!Object.prototype.hasOwnProperty.call(data, key)) {
  console.error(`missing Terraform output: ${key}`);
  process.exit(1);
}
const value = data[key] && data[key].value;
if (typeof value !== "string" || value.length === 0) {
  console.error(`Terraform output is not a non-empty string: ${key}`);
  process.exit(1);
}
process.stdout.write(value);
'
}

linewatch_aws_lab_write_smoke_artifact() {
  local artifact_path="${1:?artifact path is required}"
  local origin="${2:?origin is required}"
  local status="${3:?status is required}"
  local created_at

  created_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  mkdir -p "$(dirname "$artifact_path")"
  cat > "$artifact_path" <<EOF
{
  "project": "linewatch",
  "environment": "aws-lab",
  "origin": "$origin",
  "status": "$status",
  "createdAt": "$created_at"
}
EOF
}
```

- [ ] **Step 4: Add the smoke wrapper**

Create `scripts/aws-lab-smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/aws-lab.sh
source "$ROOT_DIR/scripts/lib/aws-lab.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"

OUTPUT_JSON="$(linewatch_aws_lab_output_json)"
ORIGIN="$(linewatch_aws_lab_output_value "$OUTPUT_JSON" http_url)"
ARTIFACT_BUCKET="$(linewatch_aws_lab_output_value "$OUTPUT_JSON" artifact_bucket)"
ARTIFACT_DIR="$ROOT_DIR/tmp/aws-lab-smoke"
ARTIFACT_PATH="$ARTIFACT_DIR/smoke-$(date -u '+%Y%m%dT%H%M%SZ').json"

LINEWATCH_DEPLOY_FRONTEND_URL="$ORIGIN" \
LINEWATCH_DEPLOY_BACKEND_URL="$ORIGIN" \
  node "$ROOT_DIR/scripts/smoke-deploy.mjs"

linewatch_aws_lab_write_smoke_artifact "$ARTIFACT_PATH" "$ORIGIN" "passed"

if command -v aws >/dev/null 2>&1; then
  aws s3 cp "$ARTIFACT_PATH" "s3://$ARTIFACT_BUCKET/smoke/$(basename "$ARTIFACT_PATH")" >/dev/null
  printf 'Smoke artifact uploaded to s3://%s/smoke/%s\n' "$ARTIFACT_BUCKET" "$(basename "$ARTIFACT_PATH")"
else
  printf 'AWS CLI not found; smoke artifact kept at %s\n' "$ARTIFACT_PATH"
fi
```

- [ ] **Step 5: Make scripts executable**

```bash
chmod +x scripts/aws-lab-smoke.sh scripts/tests/aws-lab-tools.test.sh scripts/tests/aws_lab_autostop_test.py
```

- [ ] **Step 6: Run helper tests**

```bash
bash scripts/tests/aws-lab-tools.test.sh
```

Expected: all tests pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add scripts/lib/aws-lab.sh scripts/aws-lab-smoke.sh scripts/tests/aws-lab-tools.test.sh
git commit -m "feat(infra): add aws lab smoke tooling"
```

---

### Task 5: AWS Lab Documentation

**Files:**
- Create: `infra/aws-lab/README.md`
- Modify: `README.md`

- [ ] **Step 1: Add the AWS lab README**

Create `infra/aws-lab/README.md`:

```markdown
# AWS Lab Deployment

This directory provisions an ephemeral AWS lab deployment for LineWatchTO. Production remains on the Oracle Cloud Always Free VPS. The AWS profile exists for learning, interview discussion, and infrastructure portability.

## Manual AWS Console Checklist

- Use an admin IAM identity for normal work, not the root account.
- Confirm root MFA is enabled.
- Confirm admin IAM MFA is enabled.
- Confirm the 1 USD AWS Budget alert exists and the alert email is verified.
- Confirm account credits and expiry in Billing and Cost Management.
- Confirm no unexpected resources are already running in the target region.
- Default region: `us-east-1`.

## What This Creates

- VPC, public subnet, route table, and internet gateway.
- Security group with HTTP from your configured CIDR only.
- EC2 instance with no public SSH.
- IAM role and instance profile for SSM access.
- S3 bucket for short-lived smoke/deployment artifacts.
- Lambda auto-stop function.
- EventBridge schedule for the auto-stop function.
- Short-retention CloudWatch log group for Lambda.

It does not create NAT Gateway, Elastic IP, ALB, RDS, ElastiCache, Route 53, CloudFront, ECS, or EKS.

## First-Time Setup

Authenticate the AWS CLI using IAM Identity Center/SSO or a dedicated temporary Terraform IAM access key.

Copy the example tfvars:

```bash
cp infra/aws-lab/terraform.tfvars.example infra/aws-lab/terraform.tfvars
chmod 600 infra/aws-lab/terraform.tfvars
```

Edit `infra/aws-lab/terraform.tfvars`:

- Set `allowed_http_cidrs` to your current public IP as `/32`.
- Set `linewatch_image_tag` to a pushed full Git SHA in GHCR.
- Set `postgres_password` to a long lab-only password such as `linewatch-aws-lab-demo-password-2026`.

Find your public IP:

```bash
curl https://checkip.amazonaws.com
```

Initialize and validate Terraform:

```bash
terraform -chdir=infra/aws-lab init
terraform -chdir=infra/aws-lab validate
```

Review the plan before applying:

```bash
terraform -chdir=infra/aws-lab plan
```

## Apply

Applying creates AWS resources and can incur charges. Only run this when you are ready to deploy the lab.

```bash
terraform -chdir=infra/aws-lab apply
```

After apply, Terraform prints:

- `http_url`
- `instance_id`
- `public_ip`
- `artifact_bucket`
- `ssm_start_session_command`
- `smoke_command`

## Smoke Test

Wait a few minutes for EC2 user data to install Docker and start Compose, then run:

```bash
scripts/aws-lab-smoke.sh
```

The smoke script checks the frontend and backend through the lab Caddy endpoint and uploads a small JSON result to the S3 artifact bucket when AWS CLI is available.

## SSM Access

Use the output command:

```bash
terraform -chdir=infra/aws-lab output -raw ssm_start_session_command
```

Then run the printed `aws ssm start-session ...` command.

Useful instance commands:

```bash
sudo tail -f /var/log/linewatch-aws-lab-bootstrap.log
cd /opt/linewatch/aws-lab
sudo docker compose --env-file .env.aws-lab --env-file .env.release -f docker-compose.aws-lab.yml ps
sudo docker compose --env-file .env.aws-lab --env-file .env.release -f docker-compose.aws-lab.yml logs -f caddy frontend backend
```

## Destroy

Destroy is the normal ending step. Stopping EC2 is not enough for clean billing hygiene.

```bash
terraform -chdir=infra/aws-lab destroy
```

## Post-Destroy Billing Checklist

In the AWS Console, verify:

- EC2 instance is terminated.
- No Elastic IP exists.
- No NAT Gateway exists.
- No Load Balancer exists.
- No RDS database exists.
- No unattached EBS volume or snapshot exists for the lab.
- S3 lab bucket is removed by Terraform or intentionally empty.
- CloudWatch Lambda log group is removed or short-retention.
- Billing, Bills, Free Tier, and Budget pages show no unexpected usage.

## Cost Notes

This profile is low-cost and teardown-first, not guaranteed free. AWS pricing changes. Public IPv4, EC2, EBS, S3, Lambda, CloudWatch, and data transfer can all have billable dimensions. The configured 1 USD budget alert is useful, but budget alerts are not an instant hard cap.
```

- [ ] **Step 2: Add a README cross-link**

In root `README.md`, add this short paragraph at the end of the `Deployment` section after the Oracle production docs links:

```markdown
For the separate AWS learning profile, see [infra/aws-lab/README.md](infra/aws-lab/README.md). The AWS lab is an ephemeral Terraform-managed environment for interview and infrastructure practice; production remains on the Oracle Cloud Always Free VPS.
```

- [ ] **Step 3: Commit Task 5**

```bash
git add infra/aws-lab/README.md README.md
git commit -m "docs: document aws lab deployment workflow"
```

---

### Task 6: Final Verification Without Creating AWS Resources

**Files:**
- Verify all files from Tasks 1-5.

- [ ] **Step 1: Run shell helper tests**

```bash
bash scripts/tests/aws-lab-tools.test.sh
```

Expected: all tests pass.

- [ ] **Step 2: Run Lambda unit tests**

```bash
python3 scripts/tests/aws_lab_autostop_test.py
```

Expected: `OK`.

- [ ] **Step 3: Validate Compose config**

```bash
tmp_release="$(mktemp)"
printf '%s\n' \
  'LINEWATCH_IMAGE_REGISTRY=ghcr.io/calebhabesh' \
  'LINEWATCH_IMAGE_TAG=0123456789abcdef0123456789abcdef01234567' > "$tmp_release"
docker compose \
  --env-file .env.aws-lab.example \
  --env-file "$tmp_release" \
  -f docker-compose.aws-lab.yml \
  config >/tmp/linewatch-aws-lab-compose.yml
rm -f "$tmp_release"
```

Expected: exits `0`; rendered config contains no `build:`.

- [ ] **Step 4: Format and validate Terraform**

```bash
terraform -chdir=infra/aws-lab fmt -check
terraform -chdir=infra/aws-lab init -backend=false
terraform -chdir=infra/aws-lab validate
```

Expected: formatting check passes and Terraform validates. If provider download is blocked by network sandboxing, rerun with approval or report the exact failure.

- [ ] **Step 5: Run repo-level infrastructure script tests if relevant**

```bash
bash scripts/tests/prod-release-tools.test.sh
bash scripts/tests/staging-tools.test.sh
```

Expected: existing prod/staging tool tests continue passing.

- [ ] **Step 6: Inspect changed files**

```bash
git status --short
git diff --stat
```

Expected: only AWS lab files and the README cross-link are changed since the last task commit.

- [ ] **Step 7: Final commit if any verification fixes were needed**

```bash
git add .gitignore .env.aws-lab.example Caddyfile.aws-lab docker-compose.aws-lab.yml infra/aws-lab scripts README.md
git commit -m "chore(infra): verify aws lab deployment profile"
```

Skip this commit if no files changed after prior task commits.

---

### Task 7: Optional Live AWS Apply Gate

**Files:**
- No new files unless live testing reveals fixes.

- [ ] **Step 1: Confirm the user wants to create AWS resources**

Ask directly before running `terraform apply`:

```text
This will create AWS resources that can incur charges. Do you want me to run terraform apply now?
```

- [ ] **Step 2: Prepare live tfvars**

The user or agent updates `infra/aws-lab/terraform.tfvars` with:

```hcl
allowed_http_cidrs = ["198.51.100.24/32"]
linewatch_image_tag = "0123456789abcdef0123456789abcdef01234567"
postgres_password = "linewatch-aws-lab-demo-password-2026"
```

- [ ] **Step 3: Run plan**

```bash
terraform -chdir=infra/aws-lab plan
```

Expected: plan creates VPC, subnet, internet gateway, route table, security group, EC2, IAM role/profile, S3 artifact bucket, Lambda, EventBridge rule/target, and Lambda permission. It must not create NAT Gateway, Elastic IP, ALB, RDS, ElastiCache, Route 53, CloudFront, ECS, or EKS.

- [ ] **Step 4: Apply only after reviewing the plan**

```bash
terraform -chdir=infra/aws-lab apply
```

- [ ] **Step 5: Smoke test**

```bash
scripts/aws-lab-smoke.sh
```

- [ ] **Step 6: Destroy**

```bash
terraform -chdir=infra/aws-lab destroy
```

- [ ] **Step 7: User checks AWS Console post-destroy**

The user verifies the post-destroy billing checklist in `infra/aws-lab/README.md`.
