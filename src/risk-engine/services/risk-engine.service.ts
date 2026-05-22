import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices'; // 👨‍🍳 NUEVO: Para interactuar con RabbitMQ como Productor
import { RedisAdapter } from '../adapters/redis.adapter'; // Asegura la ruta correcta en tu árbol
import { TransactionDto } from '../../transactions/dto/transaction.dto';
import * as crypto from 'crypto'; // 🔐 Módulo nativo de Node.js para hashing criptográfico SHA-256

export interface RiskVerdic {
    decision: 'ALLOW' | 'CHALLENGE' | 'DENY';
    riskScore: number;
    reasons: string[];
}

@Injectable()
export class RiskEngineService {
    // ⚙️ EDICIÓN: Inyectamos 'FRAUD_QUEUE_SERVICE' para despachar los tickets al fichero (RabbitMQ)
    constructor(
        private readonly redisAdapter: RedisAdapter,
        @Inject('FRAUD_QUEUE_SERVICE') private readonly queueClient: ClientProxy,
    ) { }

    /**
     * CAPA 1: CONTROL PERIMETRAL
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

        // ⚙️ Extraemos los datos del DTO modificado
        const { userId, amount, cardNumberToken, deviceId, deviceTelemetry } = transaction;

        // =========================================================================
        // 🔐 MOTOR DE FINGERPRINTING CRIPTOGRÁFICO
        // =========================================================================

        // Concatenamos las variables físicas estables del hardware de forma estructurada
        const rawTelemetryString = `${deviceTelemetry.canvasFingerprint}|${deviceTelemetry.hardwareConcurrency}|${deviceTelemetry.deviceMemory}`;

        // Generamos el HASH SHA-256 inmutable. Esto es el "True Device ID"
        const trueDeviceId = crypto.createHash('sha256').update(rawTelemetryString).digest('hex');

        // 🖥️ LOGS DE DIAGNÓSTICO CALIBRADOS:
        console.log("=================================================================");
        console.log("1. STRING CRUDO GENERADO EN NODE:", `"${rawTelemetryString}"`);
        console.log("2. TRUE DEVICE ID CALCULADO POR TU APPS (SHA-256):", trueDeviceId);
        console.log("=================================================================");

        // =========================================================================
        // CAPA 1: DEFENSA PERIMETRAL ULTRA-RÁPIDA (Sets de Redis)
        // =========================================================================

        // 1. Verificación de Lista Negra (Frenado fulminante en < 1ms)
        const isBlacklistedUser = await redis.sismember('fraud:blacklist', userId);
        const isBlacklistedCard = cardNumberToken ? await redis.sismember('fraud:blacklist', cardNumberToken) : false;

        // 💡 SEGURIDAD EXTRA: También verificamos si el hardware real (True Device ID) está en lista negra
        const isBlacklistedHardware = await redis.sismember('fraud:blacklist', trueDeviceId);

        if (isBlacklistedUser || isBlacklistedCard || isBlacklistedHardware) {
            const blockVerdict: RiskVerdic = {
                decision: 'DENY',
                riskScore: 100,
                reasons: ['Bloqueo Perimetral: El usuario, la tarjeta o el hardware del dispositivo se encuentran bloqueados.'],
            };

            // 🚀 ENVÍO ASINCRÓNICO: Notificamos el bloqueo a la cocina de eventos de forma inmediata (No usa await)
            this.queueClient.emit('transaction_evaluated', {
                transactionId: `PERIMETRAL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                transaction,
                verdict: blockVerdict,
                timestamp: new Date().toISOString()
            });

            return blockVerdict;
        }

        // 2. Verificación de Lista Blanca (Fast-track para usuarios VIP)
        const isWhitelistedUser = await redis.sismember('fraud:whitelist', userId);
        if (isWhitelistedUser) {
            const vipVerdict: RiskVerdic = {
                decision: 'ALLOW',
                riskScore: 0,
                reasons: ['Fast-Track: Usuario de confianza verificado en la Lista Blanca.'],
            };

            // 🚀 ENVÍO ASINCRÓNICO: Registramos el evento VIP sin bloquear el hilo principal
            this.queueClient.emit('transaction_evaluated', {
                transactionId: `VIP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                transaction,
                verdict: vipVerdict,
                timestamp: new Date().toISOString()
            });

            return vipVerdict;
        }

        // =========================================================================
        // CAPA 2: REGLAS DE NEGOCIO Y VELOCIDAD
        // =========================================================================
        let riskScore = 0;
        const reasons: string[] = [];
        let forceChallenge = false; // FLAG DE MITIGACIÓN: Fuerza la cuarentena preventiva sin llegar a banear

        // 🛡️ REGLA ANTISPOOFING: Detecta si alteraron el deviceId visible pero mantienen el mismo hardware
        if (deviceId !== trueDeviceId) {
            riskScore += 30;
            reasons.push('Spoofing Detection: El identificador del dispositivo fue alterado o no coincide con la telemetría de hardware.');
        }

        // --- 🚀 REGLA 1: SLIDING WINDOW RATE LIMITING (Sorted Sets) ---
        const now = Date.now();
        const windowSizeMs = 10000; // Ventana de tiempo móvil de 10 segundos
        const slidingVelocityKey = `fraud:velocity:sliding:${userId}`;

        // Abrimos un pipeline (multi) para enviar múltiples comandos a Redis de forma síncrona en un solo viaje de red
        const pipeline = redis.multi();

        // 1. Removemos del set ordenado todos los registros cuyo timestamp sea anterior a (ahora - 10 segundos)
        pipeline.zremrangebyscore(slidingVelocityKey, 0, now - windowSizeMs);

        // 2. Insertamos el intento actual en el set usando el timestamp actual como score y como valor identificador
        pipeline.zadd(slidingVelocityKey, now, now.toString());

        // 3. Contamos cuántos registros válidos quedan dentro del set en este preciso instante
        pipeline.zcard(slidingVelocityKey);

        // 4. Renovamos el TTL de la estructura completa para evitar fugas de memoria (limpieza pasiva)
        pipeline.expire(slidingVelocityKey, 15);

        // Ejecutamos el pipeline de forma atómica en Redis
        const pipelineResults = await pipeline.exec();

        // Evaluamos el conteo que devolvió el comando 'zcard' (ubicado en el índice 2 del array de respuestas)
        const currentTxCount = pipelineResults && pipelineResults[2] ? (pipelineResults[2][1] as number) : 1;

        if (currentTxCount > 5) {
            riskScore += 80;
            reasons.push(`Sliding Velocity Alert: Se detectaron ${currentTxCount} transacciones en una ventana móvil de 10 segundos (Posible Bot/Carding).`);
        } else if (currentTxCount > 3) {
            riskScore += 40;
            reasons.push(`Sliding Velocity Warning: Actividad inusualmente alta de transacciones (${currentTxCount}) en tiempo real.`);
        }

        // --- REGLA 2: CONTROL DE MONTOS ---
        if (amount > 10000) {
            riskScore += 50;
            reasons.push('High Amount: Monto excede el límite operativo estándar para validación directa.');
        }

        // --- REGLA 3: VELOCIDAD CRUZADA (CALIBRADA CON TRUE DEVICE ID CRIPTOGRÁFICO) ---
        if (trueDeviceId && cardNumberToken) {
            const crossDeviceKey = `fraud:velocity:cross:device:${trueDeviceId}`;
            await redis.sadd(crossDeviceKey, cardNumberToken);
            const uniqueCardsCount = await redis.scard(crossDeviceKey);

            if (uniqueCardsCount === 1) {
                await redis.expire(crossDeviceKey, 600); // 10 minutos de ventana
            }

            if (uniqueCardsCount > 2) {
                forceChallenge = true;
                riskScore += 60;
                reasons.push(`Cross-Velocity Trigger: Se detectó el uso de ${uniqueCardsCount} tarjetas distintas en este hardware. Desafío de identidad requerido.`);
            }
        }

        // --- DECISIÓN FINAL CALIBRADA ---
        let decision: 'ALLOW' | 'CHALLENGE' | 'DENY' = 'ALLOW';

        if (riskScore >= 80 && !forceChallenge) {
            decision = 'DENY';
        } else if (riskScore >= 40 || forceChallenge) {
            decision = 'CHALLENGE';
        }

        const finalVerdict: RiskVerdic = {
            decision,
            riskScore: Math.min(riskScore, 100),
            reasons,
        };

        // =========================================================================
        // 🚀 EL PINCHAZO EN EL FICHERO (Despacho a RabbitMQ)
        // =========================================================================
        // Publicamos el evento de análisis completo. Tardará < 0.5ms en impactar la cola.
        // NO usamos 'await' porque no nos interesa retrasar la respuesta HTTP del cliente por esto.
        this.queueClient.emit('transaction_evaluated', {
            transactionId: `TX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
            transaction,
            verdict: finalVerdict,
            timestamp: new Date().toISOString()
        });

        return finalVerdict;
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