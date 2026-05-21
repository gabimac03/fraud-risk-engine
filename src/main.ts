import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
    // 1. Instanciar la aplicación de NestJS usando el módulo raíz
    const app = await NestFactory.create(AppModule);

    // 2. Configurar un prefijo global para nuestras rutas (Buenas prácticas de API)
    app.setGlobalPrefix('api/v1');

    // 3. Activar el validador automático global de payloads
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    // 4. Escuchar en el puerto 3000
    const port = 3000;
    await app.listen(port);
    console.log(`🚀 Motor Anti-Fraude corriendo en: http://localhost:${port}/api/v1`);
}

// Ejecutar la función de arranque
bootstrap();