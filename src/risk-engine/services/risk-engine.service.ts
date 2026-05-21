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

    /**
     * CAPA 1: CONTROL PERIMETRAL (NUEVO MÉTODO)
     * Agrega o remueve un elemento (IP, UserID, Tarjeta) de los Sets de Redis
     */
    async toggleList(type: 'blacklist' | 'whitelist', value: string, action: 'ADD' | 'REMOVE'): Promise<void> {
        const redis = this.redisAdapter.getClient();
        const key = `fraud:${type}`;

        if (action === 'ADD') {
            await redis.sadd(key, value);
        } else {
            await redis.srem(key, value);
        }
    }

    async evaluateRisk(transaction: TransactionDto): Promise<RiskVerdic> {
        const redis = this.redisAdapter.getClient();
        const { userId, amount, cardNumberToken } = transaction;

        // =========================================================================
        // CAPA 1: DEFENSA PERIMETRAL ULTRA-RÁPIDA (Sets de Redis)
        // =========================================================================

        // 1. Verificación de Lista Negra (Frenado fulminante en < 1ms)
        const isBlacklistedUser = await redis.sismember('fraud:blacklist', userId);
        const isBlacklistedCard = cardNumberToken ? await redis.sismember('fraud:blacklist', cardNumberToken) : false;

        if (isBlacklistedUser || isBlacklistedCard) {
            return {
                decision: 'DENY',
                riskScore: 100,
                reasons: ['Bloqueo Perimetral: El usuario o la tarjeta de crédito se encuentran bloqueados en la Lista Negra.'],
            };
        }

        // 2. Verificación de Lista Blanca (Fast-track para usuarios VIP)
        const isWhitelistedUser = await redis.sismember('fraud:whitelist', userId);
        if (isWhitelistedUser) {
            return {
                decision: 'ALLOW',
                riskScore: 0,
                reasons: ['Fast-Track: Usuario de confianza verificado en la Lista Blanca.'],
            };
        }

        // =========================================================================
        // CAPA 2: REGLAS DE NEGOCIO Y VELOCIDAD (Tu lógica original intacta)
        // =========================================================================
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

        // --- DECISIÓN FINAL ---
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

    async saveToQuarantine(transactionId: string): Promise<void> {
        const redis = this.redisAdapter.getClient();
        const quarantineKey = `fraud:quarantine:${transactionId}`;

        await redis.set(quarantineKey, 'PENDING');
        await redis.expire(quarantineKey, 300);
    }

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