import { Controller, Post, Body, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TransactionDto } from '../dto/transaction.dto';
import { Verify2faDto } from '../dto/verify-2fa.dto';
import { RiskEngineService } from '../../risk-engine/services/risk-engine.service';
import { FraudRecord, FraudRecordDocument } from '../../schemas/fraud-record.schema';

@Controller('transactions')
export class TransactionsController {
    constructor(
        private readonly riskEngineService: RiskEngineService,
        // Inyectamos el modelo de Mongo de forma limpia
        @InjectModel(FraudRecord.name) private readonly fraudRecordModel: Model<FraudRecordDocument>,
    ) { }

    @Post()
    @HttpCode(HttpStatus.OK)
    async evaluateTransaction(@Body() transactionDto: TransactionDto) {
        const verdict = await this.riskEngineService.evaluateRisk(transactionDto);
        const transactionId = Math.random().toString(36).substring(2, 15).toUpperCase();

        if (verdict.decision === 'CHALLENGE') {
            await this.riskEngineService.saveToQuarantine(transactionId);
        }

        // 💾 PERSISTENCIA EN MONGODB: Guardamos el historial inmutable de auditoría
        await this.fraudRecordModel.create({
            transactionId,
            userId: transactionDto.userId,
            amount: transactionDto.amount,
            currency: transactionDto.currency,
            decision: verdict.decision,
            riskScore: verdict.riskScore,
            reasons: verdict.reasons,
            metadata: {
                deviceId: transactionDto.deviceId,
                location: transactionDto.location,
            },
        });

        return {
            success: verdict.decision !== 'DENY',
            transactionId,
            ...verdict,
            timestamp: new Date().toISOString(),
        };
    }

    @Post('verify-2fa')
    @HttpCode(HttpStatus.OK)
    async verify2fa(@Body() verify2faDto: Verify2faDto) {
        const { transactionId, code } = verify2faDto;
        const result = await this.riskEngineService.verifyQuarantineChallenge(transactionId, code);

        if (!result.success) {
            throw new BadRequestException(result.message);
        }

        // 📝 ACTUALIZACIÓN EN MONGODB: Si el desafío es aprobado, dejamos constancia en el histórico
        await this.fraudRecordModel.updateOne(
            { transactionId },
            { $set: { decision: 'ALLOW', riskScore: 0 }, $push: { reasons: '2FA Verification: Desafío resuelto con éxito.' } }
        );

        return {
            status: 'SUCCESS',
            transactionId,
            message: result.message,
            timestamp: new Date().toISOString(),
        };
    }
}