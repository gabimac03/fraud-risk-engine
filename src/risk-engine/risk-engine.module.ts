import { Module } from '@nestjs/common';
import { RedisAdapter } from './adapters/redis.adapter';
import { RiskEngineService } from './services/risk-engine.service'; // Importamos el servicio

@Module({
    providers: [RedisAdapter, RiskEngineService], // Registramos el servicio como provider
    exports: [RedisAdapter, RiskEngineService],   // ⚠️ LO EXPORTAMOS para que el Gateway pueda consumirlo
})
export class RiskEngineModule { }