# AWS Lab Deployment

This directory provisions an ephemeral AWS lab deployment for LineWatchTO. Production remains on the Oracle Cloud Always Free VPS. The AWS profile exists for learning, interview discussion, resume evidence, and infrastructure portability.

## Manual AWS Console Checklist

- Use an admin IAM identity for normal work, not the root account.
- Confirm root MFA is enabled.
- Confirm admin IAM MFA is enabled.
- Confirm no root access keys exist.
- Confirm the 1 USD AWS Budget alert exists and the alert email is verified.
- Confirm account credits and expiry in Billing and Cost Management.
- Review Free Tier, Bills, and Budgets before applying.
- Confirm no unexpected resources are already running in the target region.
- Default region: `us-east-1`.

## What Terraform Creates

- VPC, public subnet, route table, and internet gateway.
- Security group with HTTP from configured CIDRs only.
- EC2 instance with no public SSH.
- IAM role and instance profile for SSM access.
- S3 bucket for short-lived smoke/deployment artifacts.
- Lambda auto-stop function.
- EventBridge schedule for the auto-stop function.
- Short-retention CloudWatch log group for Lambda.

Terraform does not create NAT Gateway, Elastic IP, ALB, RDS, ElastiCache, Route 53, CloudFront, ECS, or EKS.

## First-Time Setup

Authenticate the AWS CLI using IAM Identity Center/SSO or a dedicated temporary Terraform IAM access key. If you use a dedicated access key, delete or rotate it after the lab work is complete.

Copy the example tfvars:

```bash
cp infra/aws-lab/terraform.tfvars.example infra/aws-lab/terraform.tfvars
chmod 600 infra/aws-lab/terraform.tfvars
```

Find your public IP:

```bash
curl https://checkip.amazonaws.com
```

Edit `infra/aws-lab/terraform.tfvars`:

- Set `allowed_http_cidrs` to your current public IP as `/32`.
- Set `linewatch_image_tag` to a pushed full Git SHA in GHCR.
- Set `postgres_password` to a long lab-only password such as `linewatch-aws-lab-demo-password-2026`.

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

Print the SSM command:

```bash
terraform -chdir=infra/aws-lab output -raw ssm_start_session_command
```

Run the printed `aws ssm start-session ...` command.

Useful instance commands:

```bash
sudo tail -f /var/log/linewatch-aws-lab-bootstrap.log
cd /opt/linewatch/aws-lab
sudo docker compose --env-file .env.aws-lab --env-file .env.release -f docker-compose.aws-lab.yml ps
sudo docker compose --env-file .env.aws-lab --env-file .env.release -f docker-compose.aws-lab.yml logs -f caddy frontend backend
```

## Compose Env Files

`docker-compose.aws-lab.yml` marks `env_file` `.env.aws-lab` as `required: false` only so config rendering works locally. Real lab runs pass explicit env files and must have generated `.env.aws-lab` and `.env.release` files on EC2.

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
