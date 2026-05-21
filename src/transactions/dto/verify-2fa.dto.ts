import { IsNotEmpty, IsString, Length } from 'class-validator';

export class Verify2faDto {
    @IsString()
    @IsNotEmpty()
    transactionId!: string;

    @IsString()
    @IsNotEmpty()
    @Length(6, 6) // Forzamos a que el código OTP sea de exactamente 6 caracteres/dígitos
    code!: string;
}