# La infraestructura se creó el 2026-10-29 desde otra máquina y su state no está disponible.
# Estos bloques adoptan los recursos que ya existen en la cuenta 240864711260 sin recrearlos.
# Después del primer apply se pueden borrar: el state ya los recuerda.

import {
  to = aws_ecr_repository.api
  id = "eventos-u/api"
}
import {
  to = aws_ecr_repository.worker
  id = "eventos-u/worker"
}

import {
  to = aws_ecs_cluster.principal
  id = "eventos-u-cluster"
}
import {
  to = aws_ecs_task_definition.api
  id = "arn:aws:ecs:us-east-1:240864711260:task-definition/eventos-u-api:1"
}
import {
  to = aws_ecs_task_definition.worker
  id = "arn:aws:ecs:us-east-1:240864711260:task-definition/eventos-u-worker:1"
}
import {
  to = aws_ecs_service.api
  id = "eventos-u-cluster/api"
}
import {
  to = aws_ecs_service.worker
  id = "eventos-u-cluster/worker"
}

import {
  to = aws_iam_role.ecs_execution
  id = "eventos-u-ecs-execution"
}
import {
  to = aws_iam_role_policy_attachment.ecs_execution
  id = "eventos-u-ecs-execution/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
import {
  to = aws_iam_role_policy.leer_secreto_bd
  id = "eventos-u-ecs-execution:leer-secreto-bd"
}
import {
  to = aws_iam_role.ecs_task
  id = "eventos-u-ecs-task"
}
import {
  to = aws_iam_role_policy.colas_y_notificaciones
  id = "eventos-u-ecs-task:colas-y-notificaciones"
}
import {
  to = aws_iam_role.mock_lambda
  id = "eventos-u-mock-lambda"
}
import {
  to = aws_iam_role_policy_attachment.mock_lambda
  id = "eventos-u-mock-lambda/arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

import {
  to = aws_security_group.alb
  id = "sg-0c3c62ae56499e777"
}
import {
  to = aws_security_group.api
  id = "sg-0abbaef7210a0bf46"
}
import {
  to = aws_security_group.worker
  id = "sg-075759d9bfd4f164a"
}
import {
  to = aws_security_group.db
  id = "sg-0be961db1077c57e5"
}

import {
  to = aws_lb.principal
  id = "arn:aws:elasticloadbalancing:us-east-1:240864711260:loadbalancer/app/eventos-u-alb/24115100525f9baa"
}
import {
  to = aws_lb_listener.http
  id = "arn:aws:elasticloadbalancing:us-east-1:240864711260:listener/app/eventos-u-alb/24115100525f9baa/6bfb43ea6da9e77f"
}
import {
  to = aws_lb_target_group.api
  id = "arn:aws:elasticloadbalancing:us-east-1:240864711260:targetgroup/eventos-u-api/87374ed17b58d182"
}

import {
  to = aws_db_subnet_group.principal
  id = "eventos-u-db"
}
import {
  to = aws_db_instance.principal
  id = "eventos-u-db"
}

import {
  to = aws_sqs_queue.notificaciones
  id = "https://sqs.us-east-1.amazonaws.com/240864711260/eventos-u-notificaciones"
}
import {
  to = aws_sqs_queue.notificaciones_dlq
  id = "https://sqs.us-east-1.amazonaws.com/240864711260/eventos-u-notificaciones-dlq"
}
import {
  to = aws_sns_topic.notificaciones
  id = "arn:aws:sns:us-east-1:240864711260:eventos-u-notificaciones"
}

import {
  to = aws_lambda_function.mock_externo
  id = "eventos-u-mock-externo"
}
import {
  to = aws_lambda_permission.api_gateway
  id = "eventos-u-mock-externo/AllowAPIGatewayInvoke"
}
import {
  to = aws_apigatewayv2_api.mock_externo
  id = "1cc5h4f9vd"
}
import {
  to = aws_apigatewayv2_integration.mock_externo
  id = "1cc5h4f9vd/2jyk1i2"
}
import {
  to = aws_apigatewayv2_route.validar_correo
  id = "1cc5h4f9vd/pv1fehb"
}
import {
  to = aws_apigatewayv2_stage.default
  id = "1cc5h4f9vd/$default"
}

import {
  to = aws_cloudwatch_log_group.api
  id = "/ecs/eventos-u/api"
}
import {
  to = aws_cloudwatch_log_group.worker
  id = "/ecs/eventos-u/worker"
}
import {
  to = aws_cloudwatch_log_group.mock_externo
  id = "/aws/lambda/eventos-u-mock-externo"
}
import {
  to = aws_cloudwatch_metric_alarm.api_sin_replicas_sanas
  id = "eventos-u-api-sin-replicas-sanas"
}
import {
  to = aws_cloudwatch_metric_alarm.dlq_con_mensajes
  id = "eventos-u-dlq-con-mensajes"
}
import {
  to = aws_cloudwatch_dashboard.principal
  id = "eventos-u"
}

import {
  to = aws_s3_bucket.frontend
  id = "eventos-u-frontend-240864711260"
}
import {
  to = aws_s3_bucket_public_access_block.frontend
  id = "eventos-u-frontend-240864711260"
}
import {
  to = aws_s3_bucket_policy.frontend
  id = "eventos-u-frontend-240864711260"
}
import {
  to = aws_cloudfront_origin_access_control.frontend
  id = "E3MVVK63JW2VVK"
}
import {
  to = aws_cloudfront_distribution.principal
  id = "E3036AOB4ZBTB9"
}
