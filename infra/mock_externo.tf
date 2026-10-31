# Servicio externo simulado de validación de correo: Lambda detrás de un HTTP API.
# Acepta ?delay_ms= y ?fail=1 para las demos de timeout y circuit breaker.
data "archive_file" "mock_externo" {
  type        = "zip"
  source_file = "${path.module}/lambda/mock-externo/index.mjs"
  output_path = "${path.module}/.build/mock-externo.zip"
}

resource "aws_iam_role" "mock_lambda" {
  name = "${local.nombre}-mock-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "mock_lambda" {
  role       = aws_iam_role.mock_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "mock_externo" {
  function_name    = "${local.nombre}-mock-externo"
  role             = aws_iam_role.mock_lambda.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.mock_externo.output_path
  source_code_hash = data.archive_file.mock_externo.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      ALLOWED_SUFFIX = ".edu.co"
    }
  }

  depends_on = [aws_cloudwatch_log_group.mock_externo]
}

resource "aws_apigatewayv2_api" "mock_externo" {
  name          = "${local.nombre}-mock-externo"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "mock_externo" {
  api_id                 = aws_apigatewayv2_api.mock_externo.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.mock_externo.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "validar_correo" {
  api_id    = aws_apigatewayv2_api.mock_externo.id
  route_key = "POST /validar-correo"
  target    = "integrations/${aws_apigatewayv2_integration.mock_externo.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.mock_externo.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.mock_externo.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.mock_externo.execution_arn}/*/*"
}
