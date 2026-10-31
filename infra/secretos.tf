# Firma de los tokens de sesión. Las dos réplicas de la API deben compartirla para aceptar
# los tokens de la otra. Es efímera y de solo escritura: no queda en el código ni en el state.
ephemeral "random_password" "jwt" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "jwt" {
  name = "${local.nombre}/jwt-secret"
  # Prototipo: se borra al instante con terraform destroy y el nombre queda libre.
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id                = aws_secretsmanager_secret.jwt.id
  secret_string_wo         = ephemeral.random_password.jwt.result
  secret_string_wo_version = 1
}

resource "aws_iam_role_policy" "leer_secreto_jwt" {
  name = "leer-secreto-jwt"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.jwt.arn]
    }]
  })
}
