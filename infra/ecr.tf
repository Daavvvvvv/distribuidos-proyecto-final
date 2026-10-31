# scripts/publicar.sh sube aquí las imágenes con la etiqueta :latest que usan las tareas.
resource "aws_ecr_repository" "api" {
  name = "${local.nombre}/api"
}

resource "aws_ecr_repository" "worker" {
  name = "${local.nombre}/worker"
}
