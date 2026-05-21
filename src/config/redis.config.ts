import { registerAs } from '@nestjs/config';

// registerAs nos permite agrupar variables de entorno en un namespace ("redis")
export default registerAs('redis', () => {
    // Validamos en tiempo de arranque que las variables existan o tengan un valor por defecto
    return {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
    };
});