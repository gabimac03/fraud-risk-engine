import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FraudRecordDocument = FraudRecord & Document;

@Schema({ timestamps: true }) // Nos autogenera createdAt y updatedAt
export class FraudRecord {
    @Prop({ required: true })
    transactionId!: string;

    @Prop({ required: true })
    userId!: string;

    @Prop({ required: true })
    amount!: number;

    @Prop({ required: true })
    currency!: string;

    @Prop({ required: true })
    decision!: 'ALLOW' | 'CHALLENGE' | 'DENY';

    @Prop({ required: true })
    riskScore!: number;

    @Prop({ type: [String], default: [] })
    reasons!: string[];

    @Prop({ type: Object }) // Guardamos toda la metadata geográfica y de dispositivo de forma flexible
    metadata!: {
        deviceId: string;
        location: {
            country: string;
            city: string;
        };
    };
}

export const FraudRecordSchema = SchemaFactory.createForClass(FraudRecord);