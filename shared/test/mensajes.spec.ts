import { crearInscripcionConfirmada, leerInscripcionConfirmada } from '../src';

describe('mensaje InscripcionConfirmada', () => {
  it('lo que la API publica, el worker lo lee igual (ida y vuelta)', () => {
    const mensaje = crearInscripcionConfirmada({ id: 9, evento_id: 42, usuario_id: 7 });
    expect(leerInscripcionConfirmada(JSON.stringify(mensaje))).toEqual({
      tipo: 'InscripcionConfirmada',
      evento_id: 42,
      usuario_id: 7,
      notificacion_id: 9,
    });
  });

  it('acepta el mensaje literal del contrato, sin notificacion_id', () => {
    expect(leerInscripcionConfirmada('{"tipo":"InscripcionConfirmada","evento_id":42,"usuario_id":7}')).toEqual({
      tipo: 'InscripcionConfirmada',
      evento_id: 42,
      usuario_id: 7,
    });
  });

  it.each([
    ['JSON inválido', '{"tipo":'],
    ['vacío', undefined],
    ['otro tipo', '{"tipo":"Otro","evento_id":1,"usuario_id":1}'],
    ['id no numérico', '{"tipo":"InscripcionConfirmada","evento_id":"42","usuario_id":7}'],
    ['notificacion_id inválido', '{"tipo":"InscripcionConfirmada","evento_id":1,"usuario_id":1,"notificacion_id":-3}'],
    ['null', 'null'],
  ])('rechaza %s', (_caso, cuerpo) => {
    expect(leerInscripcionConfirmada(cuerpo)).toBeNull();
  });
});
