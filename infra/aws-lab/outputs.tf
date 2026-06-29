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
