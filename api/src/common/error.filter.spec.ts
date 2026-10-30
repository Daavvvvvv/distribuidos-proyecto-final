import { ArgumentsHost, Logger } from '@nestjs/common';
import { ErrorFilter } from './error.filter';

function hostFalso() {
  const respuesta = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = { switchToHttp: () => ({ getResponse: () => respuesta }) } as unknown as ArgumentsHost;
  return { host, respuesta };
}

describe('ErrorFilter (errores que no son HttpException)', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('pool de Postgres agotado responde 503 con un mensaje para reintentar', () => {
    const { host, respuesta } = hostFalso();
    new ErrorFilter().catch(new Error('timeout exceeded when trying to connect'), host);
    expect(respuesta.status).toHaveBeenCalledWith(503);
    expect(respuesta.json).toHaveBeenCalledWith({ error: 'Servicio ocupado, intenta de nuevo' });
  });

  it('un error inesperado responde 500 sin filtrar el detalle interno', () => {
    const { host, respuesta } = hostFalso();
    new ErrorFilter().catch(new Error('relation "x" does not exist'), host);
    expect(respuesta.status).toHaveBeenCalledWith(500);
    expect(respuesta.json).toHaveBeenCalledWith({ error: 'Ocurrió un error inesperado, intenta de nuevo' });
  });
});
