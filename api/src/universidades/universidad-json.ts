/**
 * La universidad como objeto { id, nombre, sigla } o NULL, desde un LEFT JOIN con alias `un`.
 * La comparten el login y los eventos para que la forma sea idéntica en todo el contrato.
 */
export const UNIVERSIDAD_JSON = `CASE WHEN un.id IS NULL THEN NULL
         ELSE json_build_object('id', un.id, 'nombre', un.nombre, 'sigla', un.sigla) END`;
