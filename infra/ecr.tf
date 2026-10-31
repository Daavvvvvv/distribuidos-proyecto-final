# scripts/publicar.sh sube aquí las imágenes con la etiqueta :latest que usan las tareas.
# force_delete: terraform destroy borra el repositorio aunque tenga imágenes.
resource "aws_ecr_repository" "api" {
  name         = "${local.nombre}/api"
  force_delete = true
}

resource "aws_ecr_repository" "worker" {
  name         = "${local.nombre}/worker"
  force_delete = true
}
