import { Controller, Get, Global, Header, Injectable, MiddlewareConsumer, Module, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Publico } from '../auth/decoradores';
import { Metricas } from './metricas';

/** Mide cada solicitud. La ruta se toma del patrón (/api/eventos/:id), no de la URL, para no crear una serie por id. */
@Injectable()
class MedirSolicitudes implements NestMiddleware {
  constructor(private readonly metricas: Metricas) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const fin = this.metricas.solicitudes.startTimer();
    res.on('finish', () => {
      const ruta = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'sin_ruta';
      if (ruta === '/metrics') return;
      fin({ metodo: req.method, ruta, estado: String(res.statusCode) });
    });
    next();
  }
}

@Controller()
class MetricasController {
  constructor(private readonly metricas: Metricas) {}

  /** Fuera del prefijo /api: lo lee Prometheus dentro de la red, no el navegador por CloudFront. */
  @Publico()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): Promise<string> {
    return this.metricas.registro.metrics();
  }
}

@Global()
@Module({
  controllers: [MetricasController],
  providers: [Metricas, MedirSolicitudes],
  exports: [Metricas],
})
export class MetricasModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MedirSolicitudes).forRoutes('{*ruta}');
  }
}
