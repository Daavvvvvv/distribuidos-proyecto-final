#!/usr/bin/env bash
# Construye las imágenes para linux/amd64 (Fargate corre en esa arquitectura; en Mac con chip M es
# obligatorio) y las sube a ECR con la etiqueta :latest que usa la infraestructura.
#
# Uso:
#   API_REPO=<uri-ecr-api> WORKER_REPO=<uri-ecr-worker> ./scripts/publicar.sh
# Los URIs salen de `terraform output` en infra/. Usa las credenciales de tu AWS CLI; nada va al repo.
set -euo pipefail

: "${API_REPO:?Falta API_REPO (URI del repositorio ECR de la API)}"
: "${WORKER_REPO:?Falta WORKER_REPO (URI del repositorio ECR del worker)}"
REGION="${AWS_REGION:-us-east-1}"
REGISTRO="${API_REPO%%/*}"

cd "$(dirname "$0")/.."

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRO"

docker build --platform linux/amd64 -f api/Dockerfile -t "$API_REPO:latest" .
docker build --platform linux/amd64 -f worker/Dockerfile -t "$WORKER_REPO:latest" .

docker push "$API_REPO:latest"
docker push "$WORKER_REPO:latest"

echo "Imágenes publicadas. Para que ECS tome la nueva versión:"
echo "  aws ecs update-service --cluster <cluster> --service <servicio> --force-new-deployment"
