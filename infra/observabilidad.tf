resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.nombre}/api"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.nombre}/worker"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "mock_externo" {
  name              = "/aws/lambda/${local.nombre}-mock-externo"
  retention_in_days = 7
}

# Sin datos también es alarma: si no hay réplicas registradas, la métrica no llega.
resource "aws_cloudwatch_metric_alarm" "api_sin_replicas_sanas" {
  alarm_name          = "${local.nombre}-api-sin-replicas-sanas"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 1
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"

  dimensions = {
    LoadBalancer = aws_lb.principal.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
}

# Un mensaje en la DLQ es un aviso que el worker no pudo entregar en 3 intentos.
resource "aws_cloudwatch_metric_alarm" "dlq_con_mensajes" {
  alarm_name          = "${local.nombre}-dlq-con-mensajes"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.notificaciones_dlq.name
  }
}

locals {
  alb = aws_lb.principal.arn_suffix
}

resource "aws_cloudwatch_dashboard" "principal" {
  dashboard_name = local.nombre
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title   = "Latencia p95 de la API (s)"
          region  = "us-east-1"
          stat    = "p95"
          period  = 60
          metrics = [["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", local.alb]]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "Solicitudes y errores 5xx"
          region = "us-east-1"
          stat   = "Sum"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", local.alb],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", local.alb],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title   = "Réplicas sanas de la API"
          region  = "us-east-1"
          stat    = "Minimum"
          period  = 60
          metrics = [["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", aws_lb_target_group.api.arn_suffix, "LoadBalancer", local.alb]]
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title  = "Mensajes en cola y en DLQ"
          region = "us-east-1"
          stat   = "Maximum"
          period = 60
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.notificaciones.name],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.notificaciones_dlq.name],
          ]
        }
      },
    ]
  })
}
