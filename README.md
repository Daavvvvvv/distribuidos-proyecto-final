# Campus Eventos: backend

API REST y worker de notificaciones (NestJS 11, PostgreSQL y SQS) para la app de eventos universitarios. Cumple el contrato del frontend (rutas `/api/...`, errores `{ "error": "..." }`) y el contrato de integración con la infraestructura AWS.

El diseño completo, sus decisiones y la revisión de ingeniería están en `DISENO-BACKEND.md` (carpeta del curso).

## Estructura

```
shared/   esquema SQL (como constante TS), migración con advisory lock, pool de pg, transacciones,
          logger JSON, clientes SQS/SNS con timeouts y el contrato del mensaje InscripcionConfirmada
api/      API REST: auth, eventos, inscripciones, outbox hacia SQS, validación de correo
          con circuit breaker, /health y /metrics
worker/   consumidor de la cola: notifica (SNS o log) y marca ENVIADA, idempotente
nginx/    balanceador local entre las 2 réplicas (reintenta en la otra si una cae)
tools/    mock-externo.mjs: servicio de validación de correo simulado
scripts/  publicar.sh (ECR), poblar-demo.mjs (datos ficticios) y demos para la sustentación
infra/    Terraform del entorno en AWS (ver infra/README.md)
```

## Correr en local

Requiere Node 22.9+ y Docker.

```bash
npm install
npm run demo:up                 # todo en Docker: nginx :3000 + 2 réplicas + worker + Postgres + cola + mock
# Si el puerto 3000 está ocupado:  API_PORT=3100 docker compose up -d --build
```

Para desarrollar la API con npm (sin Docker para la app):

```bash
cp .env.example .env
npm run dev:deps                # Postgres (:5435), ElasticMQ (:9324), mock externo (:4010)
npm run build && npm run start:api    # y en otra terminal: npm run start:worker
```

Con `SEED_DEMO=true` se crean las cuentas del modo mock del frontend, `ana@universidad.edu.co / ana123` (estudiante) y `club@universidad.edu.co / club123` (organizador), y tres eventos.

Frontend contra este backend: `npm run dev` (reenvía `/api` a `localhost:3000`) o `VITE_API_TARGET=http://localhost:3100 npm run dev`.

## Pruebas

```bash
npm run dev:deps
npm test          # 131 pruebas: unitarias + e2e contra Postgres y ElasticMQ reales
```

Las más importantes:
- `api/test/concurrencia.e2e-spec.ts`: 200 inscripciones simultáneas, cupo 40, 2 réplicas → 40 / 160.
- `api/test/notificaciones.e2e-spec.ts`: outbox con SQS caído y con SQS colgado; barrido con 2 réplicas.
- `api/test/validacion-correo.e2e-spec.ts`: timeout, reintento y apertura del circuito.
- `worker/test/worker.e2e-spec.ts`: no borra si SNS falla (DLQ al 3er intento), no duplica, apagado.

## Demos para la sustentación (con `npm run demo:up`)

| Demo | Comando | Qué muestra |
|---|---|---|
| Cupo bajo concurrencia | `npm run demo:concurrencia` | 200 inscripciones por nginx → exactamente 40 aceptadas |
| Caída de una réplica | `npm run demo:caida` | SIGKILL a api-1 durante la ráfaga: nginx reintenta en api-2, sigue 40/160 sin duplicados |
| Circuit breaker | `EXTERNAL_QUERY=fail=1 docker compose up -d api-1 api-2` y luego `npm run demo:breaker` | los registros no fallan; con el circuito abierto responden en ~60 ms |
| Worker | `docker compose logs -f worker` | cada inscripción genera un `notificacion_enviada` |
| Métricas | `curl localhost:3000/metrics` | `inscripciones_total`, `circuito_validacion_estado`, latencias |
| Datos de prueba | `npm run demo:poblar` | 8 organizadores, 19 eventos, 40 estudiantes e inscripciones, todo por la API |

Si la API está en otro puerto: `API_URL=http://localhost:3100 npm run demo:concurrencia`.

## Publicar en AWS

Todo el entorno está en `infra/` como Terraform. Su [README](infra/README.md) explica cómo crearlo desde cero, publicar versiones nuevas, encenderlo, apagarlo y retirarlo. En corto, una versión nueva del backend es:

```bash
API_REPO=$(terraform -chdir=infra output -raw ecr_api) \
WORKER_REPO=$(terraform -chdir=infra output -raw ecr_worker) \
./scripts/publicar.sh
terraform -chdir=infra apply -var app_enabled=true
```

`publicar.sh` construye para `linux/amd64` (Fargate) y sube `:latest`; el apply toma el digest de esa imagen y ECS reemplaza las tareas de a una.

## Límites conocidos del prototipo

- La validación de correo se hace en el **registro**. Está pendiente confirmar con el profesor si debe ir en la inscripción (DISENO-BACKEND.md, OV7); el camino alterno ya está especificado.
- El rol se elige en el registro: cualquiera puede registrarse como organizador (lo fija el contrato del frontend).
- Entrega de avisos al-menos-una-vez: si el worker muere justo entre publicar en SNS y confirmar, ese aviso se repite una vez.
- SNS entrega a los suscriptores del tema, no al correo del estudiante (para eso haría falta SES).
- `npm audit` reporta `multer` (subida de archivos de `@nestjs/platform-express`). La API no recibe archivos, así que esa ruta de código no se usa.
