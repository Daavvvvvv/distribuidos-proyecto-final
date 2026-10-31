resource "aws_ecs_cluster" "principal" {
  name = "${local.nombre}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

locals {
  # La API y el worker leen el mismo contrato de variables (ver api/src/config y worker/src/config).
  entorno_comun = [
    { name = "AWS_REGION", value = "us-east-1" },
    { name = "DB_HOST", value = aws_db_instance.principal.address },
    { name = "DB_NAME", value = aws_db_instance.principal.db_name },
    { name = "DB_PORT", value = tostring(aws_db_instance.principal.port) },
    { name = "DB_USER", value = aws_db_instance.principal.username },
    { name = "EXTERNAL_URL", value = aws_apigatewayv2_api.mock_externo.api_endpoint },
    { name = "PORT", value = "3000" },
    { name = "QUEUE_URL", value = aws_sqs_queue.notificaciones.url },
    { name = "SNS_TOPIC_ARN", value = aws_sns_topic.notificaciones.arn },
  ]

  # RDS genera y rota la contraseña en Secrets Manager; ECS la inyecta al arrancar la tarea.
  secreto_bd = {
    name      = "DB_PASSWORD"
    valueFrom = "${aws_db_instance.principal.master_user_secret[0].secret_arn}:password::"
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.nombre}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name         = "api"
    image        = "${aws_ecr_repository.api.repository_url}:latest"
    essential    = true
    portMappings = [{ containerPort = 3000, hostPort = 3000, protocol = "tcp" }]
    # SEED_DEMO crea las cuentas de la demo (ana y club) y unos eventos; es idempotente.
    environment = concat(local.entorno_comun, [{ name = "SEED_DEMO", value = "true" }])
    secrets = [
      local.secreto_bd,
      # Desde la versión (no el secreto) para que la tarea no arranque antes de que exista el valor.
      { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret_version.jwt.secret_arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = "us-east-1"
        awslogs-stream-prefix = "api"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.nombre}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name        = "worker"
    image       = "${aws_ecr_repository.worker.repository_url}:latest"
    essential   = true
    environment = local.entorno_comun
    secrets     = [local.secreto_bd]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.worker.name
        awslogs-region        = "us-east-1"
        awslogs-stream-prefix = "worker"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.principal.id
  task_definition = "${aws_ecs_task_definition.api.family}:${aws_ecs_task_definition.api.revision}"
  desired_count   = var.app_enabled ? 2 : 0
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }

  # Sin el permiso de leer el secreto JWT, las tareas nuevas fallarían al arrancar.
  depends_on = [aws_lb_listener.http, aws_iam_role_policy.leer_secreto_jwt]
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.principal.id
  task_definition = "${aws_ecs_task_definition.worker.family}:${aws_ecs_task_definition.worker.revision}"
  desired_count   = var.app_enabled ? 1 : 0
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.worker.id]
    assign_public_ip = true
  }
}
