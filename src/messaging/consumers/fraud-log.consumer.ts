import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';

@Controller()
export class FraudLogConsumer {

    @EventPattern('transaction_evaluated')
    async handleTransactionEvent(@Payload() data: any) {
        console.log('====== 👨‍🍳 WORKER ASINCRÓNICO (RabbitMQ) ======');
        console.log(`[Ticket Tomado] ID Transacción: ${data.transactionId}`);
        console.log(`[Resultado]: ${data.verdict.decision} | Score: ${data.verdict.riskScore}`);
        console.log(`[Historial] Guardando telemetría del usuario ${data.transaction.userId} en base de datos...`);

        // Acá simulas la lentitud de un guardado en disco duro o red externa
        await new Promise((resolve) => setTimeout(resolve, 50));

        console.log(`[✔ Disk OK] Registro persistido con éxito en segundo plano.`);
        console.log('====================================================\n');
    }
}