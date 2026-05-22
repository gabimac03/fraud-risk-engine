import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Transport } from '@nestjs/microservices'; // 👨‍🍳 NUEVO: Necesario para la conexión de microservicios

async function bootstrap() {
    // 1. Instanciar la aplicación de NestJS usando el módulo raíz
    const app = await NestFactory.create(AppModule);

    // 2. Configurar un prefijo global para nuestras rutas (Buenas prácticas de API)
    app.setGlobalPrefix('api/v1');

    // 3. Activar el validador automático global de payloads (Mantenemos tus reglas estrictas)
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    // =========================================================================
    // 👨‍🍳 NUEVO: CONFIGURACIÓN DEL MICROSERVICIO HÍBRIDO (RABBITMQ)
    // =========================================================================
    // Conectamos RabbitMQ para que el mismo proceso escuche la cola interna de logs
    app.connectMicroservice({
        transport: Transport.RMQ,
        options: {
            urls: ['amqp://localhost:5672'], // Modificá si usás credenciales o puerto custom
            queue: 'fraud_audit_logs',       // El mismo nombre de cola que el módulo
            queueOptions: {
                durable: true, // Indica que la cola resiste reinicios del servidor Rabbit
            },
        },
    });

    // Encendemos la escucha de microservicios en segundo plano
    await app.startAllMicroservices();

    // 4. Escuchar en el puerto 3000 (API HTTP)
    const port = 3000;
    await app.listen(port);
    console.log(`🚀 Motor Anti-Fraude (Híbrido) corriendo en: http://localhost:${port}/api/v1`);
    console.log(`📭 Escuchando cola 'fraud_audit_logs' en RabbitMQ...`);
}

// Ejecutar la función de arranque
bootstrap();