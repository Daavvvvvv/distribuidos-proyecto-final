# Tras 3 recepciones sin borrar (el worker falló 3 veces), el mensaje pasa a la DLQ.
resource "aws_sqs_queue" "notificaciones_dlq" {
  name                      = "${local.nombre}-notificaciones-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "notificaciones" {
  name                       = "${local.nombre}-notificaciones"
  visibility_timeout_seconds = 30
  receive_wait_time_seconds  = 10

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.notificaciones_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sns_topic" "notificaciones" {
  name = "${local.nombre}-notificaciones"
}
