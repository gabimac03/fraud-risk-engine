import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Global()
@Module({
    imports: [
        ClientsModule.register([
            {
                name: 'FRAUD_QUEUE_SERVICE',
                transport: Transport.RMQ,
                options: {
                    urls: ['amqp://localhost:5672'], // Modificá si usás credenciales o Docker externo
                    queue: 'fraud_audit_logs',
                    queueOptions: {
                        durable: true, // El fichero resiste caídas del servidor de Rabbit
                    },
                },
            },
        ]),
    ],
    exports: [ClientsModule],
})
export class MessagingModule { }