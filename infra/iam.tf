data "aws_iam_policy_document" "asumir_ecs_tasks" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Rol de ejecución: lo usa ECS para bajar la imagen, escribir logs e inyectar secretos.
resource "aws_iam_role" "ecs_execution" {
  name               = "${local.nombre}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.asumir_ecs_tasks.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "leer_secreto_bd" {
  name = "leer-secreto-bd"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_db_instance.principal.master_user_secret[0].secret_arn]
    }]
  })
}

# Rol de la tarea: lo que el código de la API y del worker puede hacer en AWS.
resource "aws_iam_role" "ecs_task" {
  name               = "${local.nombre}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.asumir_ecs_tasks.json
}

resource "aws_iam_role_policy" "colas_y_notificaciones" {
  name = "colas-y-notificaciones"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility",
        ]
        Resource = [aws_sqs_queue.notificaciones.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = [aws_sns_topic.notificaciones.arn]
      },
    ]
  })
}
