output "url_app" {
  description = "Aplicación (frontend y /api por el mismo dominio)"
  value       = "https://${aws_cloudfront_distribution.principal.domain_name}"
}

output "alb_dns" {
  description = "Balanceador de la API, destino por defecto de k6 y del sondeo"
  value       = "http://${aws_lb.principal.dns_name}"
}

output "bucket_frontend" {
  value = aws_s3_bucket.frontend.bucket
}

output "distribucion_id" {
  description = "Para invalidar la caché de CloudFront"
  value       = aws_cloudfront_distribution.principal.id
}

output "ecr_api" {
  value = aws_ecr_repository.api.repository_url
}

output "ecr_worker" {
  value = aws_ecr_repository.worker.repository_url
}

output "dashboard" {
  value = "https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=${aws_cloudwatch_dashboard.principal.dashboard_name}"
}
