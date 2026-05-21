import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionsController } from './controllers/transactions.controller';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { FraudRecord, FraudRecordSchema } from '../schemas/fraud-record.schema'; // Importamos esquema y clase

@Module({
    imports: [RiskEngineModule, // Le damos acceso a los exports de RiskEngineModule
        MongooseModule.forFeature([{ name: FraudRecord.name, schema: FraudRecordSchema }]),
    ],
    controllers: [TransactionsController],
})
export class TransactionsModule { }