variable "app_enabled" {
  description = "Enciende la API y el worker (1). En false quedan en 0 tareas y Fargate no cobra."
  type        = bool
  default     = false
}

# La prueba de disponibilidad compara 1 réplica (línea base) contra 2 (mejora).
variable "api_replicas" {
  description = "Réplicas de la API cuando app_enabled es true."
  type        = number
  default     = 2
}

locals {
  nombre = "eventos-u"
}

data "aws_caller_identity" "actual" {}

# VPC por defecto: subnets públicas en las 6 zonas de us-east-1, con salida a internet.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}
