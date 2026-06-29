# AWS Lab Deployment Profile Design

Date: 2026-06-29

## Context

LineWatchTO production remains on the Oracle Cloud Always Free VPS because that is the economically correct long-running host for this project. The AWS work is a separate learning, interview, and resume profile: it should prove that the application can be deployed with common AWS primitives without turning AWS into the production path or creating meaningful surprise-billing risk.

The user has an existing AWS account on a paid plan with a configured 1 USD budget alert and 100 USD in credits expiring on 2026-11-16. Credits reduce near-term risk, but the design must not rely on credits as the primary safety mechanism. Budget alerts are monitoring, not hard spending limits, and AWS usage and billing data can lag.

The existing project already has:

- Production-grade Docker Compose for Caddy, Next.js, Spring Boot, PostgreSQL/PostGIS, Redis, and optional Grafana Alloy.
- Immutable GHCR application image publishing for production.
- Health-gated production deployment scripts.
- On-demand local/development-server staging.
- Production and staging environment templates.

The AWS profile should reuse those strengths instead of rebuilding the application around managed AWS services prematurely.

## Goals

- Add a comprehensive, Terraform-managed AWS lab profile that can be created, smoke-tested, discussed, and destroyed.
- Demonstrate relevant AWS fundamentals for a new-grad backend/full-stack resume:
  - VPC networking
  - EC2 compute
  - IAM roles and least-privilege access
  - Security groups
  - Systems Manager Session Manager
  - S3 for deployment/smoke-test artifacts
  - CloudWatch/EventBridge/Lambda for operational automation
  - AWS Budgets and billing guardrails
- Keep the default AWS deployment logically connected to LineWatchTO's existing architecture.
- Keep the default path low-cost and teardown-first.
- Make all required AWS Console work explicit so setup is reproducible.
- Document why more enterprise AWS services are discussed but not provisioned by default.

## Non-Goals

- Replacing Oracle VPS production.
- Running an always-on public AWS production environment.
- Migrating production data to AWS.
- Using Kubernetes/EKS.
- Defaulting to NAT Gateway, ALB, Route 53, RDS, ElastiCache, ECS/Fargate, or CloudFront when they are not needed for the learning profile.
- Storing AWS credentials, env secrets, VAPID private keys, SMTP credentials, or Terraform state secrets in Git.
- Claiming LineWatchTO serves real users from AWS.
- Claiming live TTC data if ingestion is disabled or stale.

## Recommended Approach

Use an ephemeral EC2 lab deployment managed by Terraform.

The app will run on a single small EC2 instance using Docker Compose. This is intentionally close to the Oracle VPS production model so the AWS work proves infrastructure portability, not a separate rewrite. Terraform will provision the AWS account resources, and repo scripts will handle instance bootstrap, deployment, smoke testing, and teardown verification.

The default lifecycle is:

```bash
terraform apply
scripts/aws-lab-smoke.sh
# demo, inspect, screenshot, practice interview explanation
terraform destroy
```

Stopping the EC2 instance is useful as an emergency or short pause, but destroying the Terraform stack is the primary cost-control workflow because stopped instances can still leave billable resources such as EBS volumes, snapshots, logs, public IPv4 addresses, or S3 objects.

## AWS Account And Manual Console Work

The user should use the admin IAM account for normal AWS Console work, not the root account. The root account should be reserved for root-only account tasks such as account recovery, billing/account settings that require root, and closing the account.

Manual AWS Console checklist:

- Confirm root account MFA is enabled.
- Confirm the admin IAM identity has MFA enabled.
- Confirm the 1 USD budget alert exists and the alert email is verified.
- Confirm credits show 100 USD and expire on 2026-11-16.
- Confirm Free Tier usage is visible in Billing and Cost Management.
- Choose the region for the lab. Default recommendation: `us-east-1`.
- Ensure the AWS CLI can authenticate from the development machine using either IAM Identity Center/SSO or a dedicated Terraform IAM access key.
- If using a dedicated Terraform IAM access key, delete or rotate it after the lab work is complete.
- Do not create root access keys.

Optional but recommended manual checks:

- Review current VPC pricing before applying Terraform, especially public IPv4 pricing.
- Review current EC2 free-tier or credit-covered instance eligibility before applying Terraform.
- Review the Bills page after each apply/destroy cycle until familiar with the account's billing behavior.

## AWS Architecture

Default provisioned resources:

- One VPC.
- One public subnet in one availability zone.
- One internet gateway.
- One route table for public egress/ingress.
- One security group.
- One small EC2 instance.
- One IAM role and instance profile for EC2.
- SSM permissions for instance management.
- One S3 bucket for lab deployment/smoke-test artifacts with lifecycle expiry.
- One Lambda function for automatic EC2 stop.
- EventBridge schedule to invoke the auto-stop Lambda.
- Short-retention CloudWatch log group for the Lambda.

Default exposed network surface:

- HTTP from configured source CIDRs.
- No public SSH.
- No public PostgreSQL, Redis, backend management, or actuator ports.
- No HTTPS certificate automation by default unless a domain is intentionally added later.

The lab can initially use plain HTTP because it is a short-lived owner-only environment without production credentials. If HTTPS becomes necessary for PWA or Web Push experiments, it should be added as an explicit second phase with a clear cost review.

## Application Deployment

The EC2 instance will run Docker and Docker Compose.

The AWS lab Compose profile should reuse the production images where practical:

- `ghcr.io/calebhabesh/linewatch-frontend:<sha>`
- `ghcr.io/calebhabesh/linewatch-backend:<sha>`
- `ghcr.io/calebhabesh/linewatch-postgres:<sha>`
- `redis:7-alpine`
- `caddy:2-alpine`

The lab should not build images on EC2. Image building stays on the development machine/server, matching the existing production image workflow.

The AWS lab will need its own env template, for example `.env.aws-lab.example`, with safe defaults:

- Lab-specific database name/user.
- Example-only database password.
- `LINEWATCH_ENVIRONMENT=aws-lab`.
- Ingestion disabled by default unless explicitly testing live ingestion.
- GTFS refresh disabled by default unless explicitly testing schedule import.
- Push disabled by default unless HTTPS/domain setup is intentionally added.
- SMTP disabled or pointed at example-only values.
- Auth origins based on the EC2 public URL or configured lab hostname.

The lab Caddyfile should route:

- `/` to the frontend.
- `/api/*` to the backend.
- `/actuator*` to `404`.

## Terraform Layout

Add Terraform under `infra/aws-lab/`.

Suggested files:

- `versions.tf`: Terraform and provider constraints.
- `providers.tf`: AWS provider config.
- `variables.tf`: region, project name, allowed CIDRs, instance type, image tag, auto-stop schedule, feature toggles.
- `main.tf`: VPC, subnet, route, security group, EC2, IAM, S3 artifact bucket, Lambda, and EventBridge.
- `outputs.tf`: instance ID, public IP/DNS, HTTP URL, SSM start-session command, smoke-test command.
- `user_data.sh.tftpl`: EC2 bootstrap and deployment.
- `terraform.tfvars.example`: safe documented defaults.
- `README.md`: setup, apply, smoke test, destroy, and bill-check instructions.

Terraform state should start local for simplicity unless remote state is explicitly needed. The default S3 bucket is for lab artifacts, not Terraform state. If remote state is added later, use an S3 backend with encryption and lifecycle cleanup documented. A local-state default avoids creating a state backend before the user understands the billing surface.

## Cost Guardrails

The profile is designed to minimize billable AWS surface, but it is not described as free or impossible to bill.

Required controls:

- Keep the existing 1 USD budget alert.
- Use `terraform destroy` as the normal ending step.
- Avoid NAT Gateway.
- Avoid Elastic IP.
- Avoid ALB.
- Avoid RDS and ElastiCache by default.
- Avoid Route 53 hosted zones by default.
- Avoid long-retention CloudWatch logs.
- Avoid extra EBS volumes and snapshots by default.
- Keep the S3 artifact bucket lifecycle-managed.
- Keep Lambda/EventBridge auto-stop enabled by default.
- Document a post-destroy checklist:
  - EC2 instances terminated.
  - EBS volumes and snapshots removed.
  - Elastic IPs absent.
  - NAT gateways absent.
  - Load balancers absent.
  - RDS databases absent.
  - S3 lab buckets empty or intentionally retained.
  - CloudWatch log groups short-retention or removed.
  - Bills and Free Tier pages reviewed.

Known AWS cost-sensitive services to avoid by default:

- NAT Gateway because it has hourly and data-processing charges.
- ALB because it has hourly/LCU charges and public IPv4 exposure.
- Public IPv4 because AWS bills public IPv4 addresses separately.
- RDS because stopped instances still have storage/backup cost and can auto-restart after the maximum stopped window.
- Route 53 hosted zones because they bill monthly.
- EKS because the control plane and worker model are excessive for this project.

Pricing and Free Tier terms change. The implementation docs should link to AWS's current pricing pages and instruct the user to verify them before running `terraform apply`.

## Operational Automation

The auto-stop automation should be implemented with Lambda and EventBridge because it gives a legitimate Lambda use case without forcing the application into serverless architecture.

The Lambda's responsibility:

- Find EC2 instances tagged for the LineWatchTO AWS lab.
- Stop running lab instances on the configured schedule.
- Write minimal logs.

The Lambda should not:

- Delete resources.
- Touch non-lab instances.
- Depend on application secrets.
- Replace `terraform destroy`.

This gives the resume/interview benefit of Lambda/EventBridge while keeping the operational story realistic: Lambda is glue/automation, not a forced rewrite of the Spring Boot backend.

## Security Model

- Use the admin IAM account for normal console work, not root.
- No root access keys.
- No committed AWS access keys.
- EC2 gets an instance profile, not static AWS credentials.
- No public SSH by default.
- Prefer SSM Session Manager for shell access.
- Restrict HTTP ingress to user-configured CIDRs when possible.
- Keep database, Redis, backend management, and actuator ports private.
- Use lab-specific credentials, not production secrets.
- Keep `.env.aws-lab` untracked.

If public HTTP must be open to `0.0.0.0/0` for a demo, document that it is a temporary owner-controlled lab choice and revert/destroy promptly.

## AWS Service Talking Points

The finished profile should let the user discuss:

- Why EC2 was selected for this app's first AWS deployment.
- How VPC routing and security groups expose only the intended edge.
- Why SSM is better than opening SSH for a lab VM.
- How IAM roles remove static credentials from the instance.
- Why Lambda/EventBridge are appropriate for auto-stop automation.
- Why S3 is useful for artifacts and can later support remote state, but is not a database.
- Why RDS and ElastiCache are natural future managed-service migrations, but not default for cost reasons.
- Why ALB/ECS/Fargate are realistic next steps for higher availability, but not justified for a short-lived resume lab.
- How Terraform makes the environment reproducible and destroyable.

## Resume Framing

Accurate resume bullet:

> Built a Terraform-managed AWS lab deployment for LineWatchTO, provisioning VPC networking, IAM, EC2, security groups, SSM access, S3-backed artifacts, and Lambda/EventBridge cost automation to run the existing containerized Next.js/Spring Boot/PostGIS/Redis stack as a short-lived cloud staging environment.

Accurate interview explanation:

> Production stayed on an Oracle Cloud Always Free VPS for cost reasons, but I built an AWS deployment profile to demonstrate cloud portability, infrastructure-as-code, secure networking, IAM, operational automation, and cost-aware architecture. I deliberately avoided NAT Gateway, ALB, and managed databases in the default path because this was a learning lab, not a paid production migration.

Avoid claiming:

- AWS is the production host.
- The deployment is free.
- The app uses ECS, RDS, ElastiCache, CloudFront, or Route 53 unless those are added later.
- The lab processes real user traffic.

## Verification

Spec/design verification:

- Terraform validates.
- Terraform plan shows only the expected resources.
- Shell scripts pass syntax checks.
- Documentation includes apply, smoke, destroy, and bill-check steps.

Runtime verification:

- `terraform apply` completes.
- EC2 reaches running status.
- Docker Compose services become healthy.
- HTTP frontend responds.
- `/api/health` responds through Caddy.
- Actuator endpoint is blocked publicly.
- Auto-stop Lambda can stop the tagged instance.
- `terraform destroy` removes all Terraform-managed resources.
- AWS Console post-destroy checklist shows no lingering costly lab resources.

## Future Extensions

These are intentionally second-phase options:

- ECS/Fargate service profile for container orchestration practice.
- RDS PostgreSQL/PostGIS profile for managed database practice.
- ElastiCache Redis profile.
- ALB + ACM + Route 53 hostname profile.
- CloudFront in front of a static/exported frontend, if the frontend architecture changes to make that useful.
- CI job that runs `terraform plan` on pull requests without applying infrastructure.

Each extension should get its own cost review and opt-in Terraform variable or separate module before implementation.
