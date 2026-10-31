# Infraestructura de Campus Eventos en AWS

Terraform de todo el entorno en `us-east-1`. El frontend y la API comparten un solo dominio de CloudFront, así que el navegador nunca habla con otro origen.

## Qué se crea

Una solicitud del usuario entra por CloudFront. Las rutas `/api/*` van al balanceador (ALB) y de ahí a una de las 2 réplicas de la API en ECS Fargate; el resto sale del bucket S3 del frontend, que es privado y solo CloudFront puede leer. La API guarda en RDS y, cuando alguien se inscribe, deja el aviso en una cola SQS. El worker lo toma de la cola y lo publica en SNS. Tras 3 intentos fallidos el mensaje pasa a la DLQ.

| Archivo | Recursos |
|---|---|
| `red.tf` | Security groups del ALB, la API, el worker y la base. Usa la VPC por defecto. |
| `alb.tf` | Balanceador, target group (`/health`, 15 s) y listener HTTP. |
| `ecs.tf` | Cluster, task definitions de la API y el worker, y sus servicios. |
| `rds.tf` | PostgreSQL 16 `db.t4g.micro`. RDS genera la contraseña y la guarda en Secrets Manager. |
| `mensajeria.tf` | Cola de notificaciones, su DLQ y el tema SNS. |
| `mock_externo.tf` | Servicio externo simulado de validación de correo (Lambda detrás de un HTTP API). |
| `observabilidad.tf` | Logs de 7 días, dashboard `eventos-u` y dos alarmas. |
| `frontend.tf` | Bucket del frontend y distribución de CloudFront. |
| `secretos.tf` | Secreto JWT, generado en el apply y de solo escritura. No queda en el state. |
| `iam.tf`, `ecr.tf` | Roles de las tareas y repositorios de imágenes. |

## Requisitos

- AWS CLI v2 con el comando `aws login`, Terraform 1.5 o más reciente, Docker y Node 22.9 o más reciente.
- Una VPC por defecto en `us-east-1`. Las tareas y el ALB usan sus subnets públicas.
- Credenciales de la cuenta. Nunca van en el repositorio:

```bash
aws login --profile eventos-u --region us-east-1
export AWS_PROFILE=eventos-u
```

## Crear el entorno desde cero

Va en dos tiempos, porque la task definition apunta al digest de la imagen y la imagen tiene que existir en ECR antes del apply completo.

```bash
cd infra
terraform init

# 1. Solo los repositorios de imágenes
terraform apply -target=aws_ecr_repository.api -target=aws_ecr_repository.worker

# 2. Construir y subir las imágenes (desde la raíz del repo)
cd ..
API_REPO=$(terraform -chdir=infra output -raw ecr_api) \
WORKER_REPO=$(terraform -chdir=infra output -raw ecr_worker) \
./scripts/publicar.sh

# 3. Todo lo demás, con la app encendida
terraform -chdir=infra apply -var app_enabled=true
```

RDS y CloudFront son los recursos que más tardan en crearse. Al arrancar, la API crea las tablas y el catálogo de universidades, y `SEED_DEMO` crea las cuentas de la guía de la demo.

El frontend vive en el repo `distribuidos-proyecto-final-frontend`:

```bash
VITE_USE_MOCK=false npm run build
aws s3 sync dist/ s3://<bucket_frontend> --delete
aws cloudfront create-invalidation --distribution-id <distribucion_id> --paths "/*"
```

`terraform output` muestra `bucket_frontend`, `distribucion_id` y `url_app`. Para poblar la demo con datos ficticios, desde la raíz del backend:

```bash
API_URL=$(terraform -chdir=infra output -raw url_app) npm run demo:poblar
```

Comprobación rápida: `curl $(terraform -chdir=infra output -raw alb_dns)/health` debe responder `{"status":"ok"}`, y `<url_app>/api/universidades` la lista de universidades.

## Publicar una versión nueva del backend

```bash
API_REPO=$(terraform -chdir=infra output -raw ecr_api) \
WORKER_REPO=$(terraform -chdir=infra output -raw ecr_worker) \
./scripts/publicar.sh
terraform -chdir=infra apply -var app_enabled=true
```

El digest nuevo crea otra revisión de la task definition y ECS reemplaza las tareas de a una, así que la API no se cae durante el cambio. Si solo cambia el código y no se corre el apply, no se despliega nada.

## Encender y apagar

`app_enabled` vale `false` por defecto: **un `terraform apply` sin la variable deja la API y el worker en 0 tareas**. Fargate deja de cobrar, pero RDS, el ALB y lo demás siguen encendidos. Para volver a prender: `terraform apply -var app_enabled=true` (2 réplicas de la API y 1 worker).

## Retirar el entorno

```bash
terraform -chdir=infra destroy
```

Borra todo, datos incluidos: RDS sin snapshot final, los repositorios de ECR con sus imágenes, el bucket con el build y el secreto JWT sin periodo de recuperación. Es lo que se quiere para un prototipo con datos ficticios.

## Pasos manuales que quedan

- El `aws login`, que abre el navegador.
- La creación en dos tiempos descrita arriba.
- El build y la subida del frontend, que viven en el otro repositorio.
- El state (`terraform.tfstate`) queda solo en la máquina de quien aplica y está fuera de git porque puede guardar datos sensibles. Si dos personas aplican desde máquinas distintas, cada una tiene su propio state sobre los mismos recursos y pueden pisarse. El siguiente paso sería un backend remoto en S3.

La infraestructura se desplegó por primera vez el 2026-10-29 desde otra máquina, sin su state. El 2026-10-30 este código se escribió a partir de lo que había en la cuenta y la adoptó con bloques `import` (commit `b7e2890`). Con el state ya creado esos bloques se borraron, para que este código también sirva en una cuenta nueva.

## Límites conocidos

- CloudFront llega al ALB por HTTP. Pasarlo a HTTPS exige un dominio propio con certificado de ACM. El ALB también acepta tráfico directo desde internet; lo usan las pruebas de carga y el sondeo.
- RDS está en una sola zona y sin cifrado de disco. Perder esa zona tumba el servicio, y dos réplicas de la API no lo evitan.
- Las tareas corren en subnets públicas con IP pública (VPC por defecto, sin NAT) y solo las protegen los security groups.
- `SEED_DEMO` crea cuentas con contraseñas conocidas (`ana123`, `club123`). No dan más permisos que el registro abierto, pero en un entorno real no deberían existir.
- La contraseña de la base rota cada 7 días (la próxima vez el 2026-11-05) y ECS la inyecta solo al arrancar cada tarea. Después de una rotación hay que redesplegar la API y el worker (`aws ecs update-service --force-new-deployment`), o las conexiones nuevas fallarán.
