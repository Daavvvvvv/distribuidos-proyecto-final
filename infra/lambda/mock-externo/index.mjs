// Servicio externo simulado: valida que el correo sea institucional.
// Simula el directorio de correos institucionales: vale cualquier dominio que termine en ALLOWED_SUFFIX.
// Qué universidades acepta Campus Eventos lo decide el catálogo del backend, no este servicio.
// Query params para simular problemas durante la demo:
//   ?delay_ms=3000  responde con demora
//   ?fail=1         responde con error 500
const ALLOWED_SUFFIX = process.env.ALLOWED_SUFFIX;

export const handler = async (event) => {
  const query = event.queryStringParameters ?? {};

  const delay = Number(query.delay_ms ?? 0);
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  if (query.fail === "1") {
    return json(500, { error: "fallo simulado" });
  }

  let email = "";
  try {
    email = JSON.parse(event.body ?? "{}").email ?? "";
  } catch {
    return json(400, { error: "JSON invalido" });
  }

  const domain = email.toLowerCase().split("@")[1] ?? "";
  return json(200, { email, valid: domain.endsWith(ALLOWED_SUFFIX), domain });
};

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
