import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import redisConfig from '../../config/redis.config';

@Injectable() // Hace que esta clase sea administrada por el contenedor de inversión de control de NestJS
export class RedisAdapter implements OnModuleInit, OnModuleDestroy {
    // Declaramos la propiedad que sostendrá la conexión activa a Redis
    private redisClient!: Redis;

    // Inyectamos la configuración que creamos y agrupamos bajo el namespace 'redis'
    constructor(
        @Inject(redisConfig.KEY)
        private readonly config: ConfigType<typeof redisConfig>,
    ) { }

    // Este método nativo de NestJS se ejecuta automáticamente al levantar el módulo
    onModuleInit() {
        console.log(`🔌 Conectando a Redis en ${this.config.host}:${this.config.port}...`);

        this.redisClient = new Redis({
            host: this.config.host,
            port: this.config.port,
            maxRetriesPerRequest: 3, // Máximo de reintentos de conexión antes de lanzar un error
        });

        // Escuchamos el evento nativo de conexión exitosa del socket
        this.redisClient.on('connect', () => {
            console.log('✅ Conexión a Redis establecida exitosamente.');
        });

        // Capturamos cualquier falla de red para que no tumbe el proceso de Node.js por completo
        this.redisClient.on('error', (err) => {
            console.error('❌ Error crítico en el cliente de Redis:', err);
        });
    }

    // Este método se ejecuta automáticamente si la aplicación recibe una señal de apagado
    async onModuleDestroy() {
        await this.redisClient.quit(); // Cierra los descriptores de archivo y sockets de red abiertos
        console.log('🔌 Conexión a Redis cerrada limpiamente.');
    }

    // Método de conveniencia pública para exponer el cliente hacia los servicios de análisis de riesgo
    getClient(): Redis {
        return this.redisClient;
    }
}