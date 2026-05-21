import { Injectable } from '@nestjs/common';
import { RedisAdapter } from '../adapters/redis.adapter';
import { TransactionDto } from '../../transactions/dto/transaction.dto';

export interface RiskVerdic {
    decision: 'ALLOW' | 'CHALLENGE' | 'DENY';
    riskScore: number;
    reasons: string[];
}

@Injectable()
export class RiskEngineService {
    constructor(private readonly redisAdapter: RedisAdapter) { }

    async evaluateRisk(transaction: TransactionDto): Promise<RiskVerdic> {
        const redis = this.redisAdapter.getClient();
        const { userId, amount } = transaction;

        let riskScore = 0;
        const reasons: string[] = [];

        // --- REGLA 1: VELOCITY ATTACK ---
        const velocityKey = `fraud:velocity:${userId}`;
        const currentTxCount = await redis.incr(velocityKey);

        if (currentTxCount === 1) {
            await redis.expire(velocityKey, 10);
        }

        if (currentTxCount > 5) {
            riskScore += 80;
            reasons.push('Velocity Alert: Demasiadas transacciones en menos de 10 segundos (Posible Bot/Carding).');
        } else if (currentTxCount > 3) {
            riskScore += 40;
            reasons.push('Velocity Warning: Actividad inusualmente alta de transacciones.');
        }

        // --- REGLA 2: CONTROL DE MONTOS ---
        if (amount > 10000) {
            riskScore += 50;
            reasons.push('High Amount: Monto excede el límite operativo estándar para validación directa.');
        }

        let decision: 'ALLOW' | 'CHALLENGE' | 'DENY' = 'ALLOW';

        if (riskScore >= 80) {
            decision = 'DENY';
        } else if (riskScore >= 40) {
            decision = 'CHALLENGE';
        }

        return {
            decision,
            riskScore: Math.min(riskScore, 100),
            reasons,
        };
    }

    // 💡 AGREGAR ESTE MÉTODO (Si faltaba)
    async saveToQuarantine(transactionId: string): Promise<void> {
        const redis = this.redisAdapter.getClient();
        const quarantineKey = `fraud:quarantine:${transactionId}`;

        await redis.set(quarantineKey, 'PENDING');
        await redis.expire(quarantineKey, 300); // 5 minutos de ventana
    }

    // 💡 AGREGAR ESTE MÉTODO (Si faltaba)
    async verifyQuarantineChallenge(transactionId: string, code: string): Promise<{ success: boolean; message: string }> {
        const redis = this.redisAdapter.getClient();
        const quarantineKey = `fraud:quarantine:${transactionId}`;

        const currentStatus = await redis.get(quarantineKey);
        if (!currentStatus) {
            return { success: false, message: 'La transacción no existe en cuarentena o ya expiró.' };
        }

        if (currentStatus !== 'PENDING') {
            return { success: false, message: `La transacción ya fue procesada con estado: ${currentStatus}` };
        }

        if (code !== '123456') {
            return { success: false, message: 'Código 2FA inválido. Intente nuevamente.' };
        }

        await redis.set(quarantineKey, 'APPROVED');
        await redis.expire(quarantineKey, 60);

        return {
            success: true,
            message: 'Desafío 2FA aprobado. Transacción liberada y procesada correctamente.',
        };
    }
}