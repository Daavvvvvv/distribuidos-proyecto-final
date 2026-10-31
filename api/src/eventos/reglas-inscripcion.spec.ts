import { MOTIVO, permisos } from './reglas-inscripcion';

const base = { esOrganizador: false, inscrito: false, pasado: false, lleno: false };

describe('permisos de inscripción', () => {
  it.each([
    ['puede inscribirse', base, { puedeInscribirse: true, puedeCancelar: false, motivo: null }],
    ['inscrito: puede cancelar', { ...base, inscrito: true }, { puedeInscribirse: false, puedeCancelar: true, motivo: null }],
    ['inscrito con el cupo lleno: igual puede cancelar', { ...base, inscrito: true, lleno: true }, { puedeInscribirse: false, puedeCancelar: true, motivo: null }],
    ['inscrito en un evento pasado', { ...base, inscrito: true, pasado: true }, { puedeInscribirse: false, puedeCancelar: false, motivo: MOTIVO.pasado }],
    ['organizador', { ...base, esOrganizador: true }, { puedeInscribirse: false, puedeCancelar: false, motivo: MOTIVO.organizador }],
    ['organizador gana a pasado y lleno', { ...base, esOrganizador: true, pasado: true, lleno: true }, { puedeInscribirse: false, puedeCancelar: false, motivo: MOTIVO.organizador }],
    ['pasado gana a lleno', { ...base, pasado: true, lleno: true }, { puedeInscribirse: false, puedeCancelar: false, motivo: MOTIVO.pasado }],
    ['lleno', { ...base, lleno: true }, { puedeInscribirse: false, puedeCancelar: false, motivo: MOTIVO.lleno }],
  ])('%s', (_caso, estado, esperado) => {
    expect(permisos(estado)).toEqual(esperado);
  });
});
