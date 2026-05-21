import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TransactionsModule } from './transactions/transactions.module';
import redisConfig from './config/redis.config';
import { MongooseModule } from '@nestjs/mongoose'; // Importamos el conector

@Module({
    imports: [
        MongooseModule.forRoot('mongodb://root:fraud_pass123@localhost:27017/fraud_records?authSource=admin'),
        // ConfigModule.forRoot lee el archivo .env de la raíz y expone las variables
        ConfigModule.forRoot({
            isGlobal: true, // Hace que la configuración esté disponible en cualquier módulo
            load: [redisConfig], // Carga nuestro esquema validado de Redis
        }),
        TransactionsModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule { }