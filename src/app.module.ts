import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TransactionsModule } from './transactions/transactions.module';
import redisConfig from './config/redis.config';
import { MongooseModule } from '@nestjs/mongoose'; // Importamos el conector

// 👨‍🍳 NUEVOS IMPORTS: Traemos las piezas de la Feature 3
import { MessagingModule } from './messaging/messaging.module';
import { FraudLogConsumer } from './messaging/consumers/fraud-log.consumer';

@Module({
    imports: [
        // Conexión de persistencia para los logs históricos en MongoDB
        MongooseModule.forRoot('mongodb://root:fraud_pass123@localhost:27017/fraud_records?authSource=admin'),

        // ConfigModule lee el archivo .env de la raíz y expone las variables
        ConfigModule.forRoot({
            isGlobal: true, // Hace que la configuración esté disponible en cualquier módulo
            load: [redisConfig], // Carga nuestro esquema validado de Redis
        }),

        TransactionsModule,

        // 🚀 NUEVO: Registramos el módulo de RabbitMQ de forma global
        MessagingModule,
    ],
    controllers: [
        // 🚀 NUEVO: Declaramos al "Planchista" para que intercepte los mensajes de la cola
        FraudLogConsumer,
    ],
    providers: [],
})
export class AppModule { }