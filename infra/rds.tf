resource "aws_db_subnet_group" "principal" {
  name       = "${local.nombre}-db"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_db_instance" "principal" {
  identifier     = "${local.nombre}-db"
  engine         = "postgres"
  engine_version = "16.13"
  instance_class = "db.t4g.micro"

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = "eventos"
  username = "eventos_admin"
  # La contraseña la genera RDS en Secrets Manager; nunca pasa por el código ni por el state.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.principal.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  # Prototipo: una sola zona y sin snapshot final al destruir.
  multi_az                = false
  backup_retention_period = 1
  skip_final_snapshot     = true

  lifecycle {
    # AWS no devuelve este atributo, así que tras importar la instancia el state lo tiene vacío;
    # reenviarlo haría un ModifyDBInstance innecesario sobre una base que ya gestiona su contraseña.
    ignore_changes = [manage_master_user_password]
  }
}
