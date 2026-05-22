import { IsNotEmpty, IsNumber, IsString, IsPositive, IsUUID, IsObject, ValidateNested, Length } from 'class-validator';
import { Type } from 'class-transformer';

// 1. Sub-objeto para la ubicación geográfica de la transacción
class LocationDto {
    @IsString()
    @IsNotEmpty()
    @Length(2, 2) // Código de país de 2 letras (ISO 3166-1 alpha-2), ej: "AR", "US"
    country!: string;

    @IsString()
    @IsNotEmpty()
    city!: string;
}

// 💻 NUEVO: Sub-objeto para recolectar la telemetría cruda del hardware del cliente
class DeviceTelemetryDto {
    @IsString()
    @IsNotEmpty()
    canvasFingerprint!: string; // Hash único del renderizado de la GPU

    @IsNumber()
    @IsPositive()
    hardwareConcurrency!: number; // Cantidad de núcleos de CPU (ej. 4, 8, 16)

    @IsNumber()
    @IsPositive()
    deviceMemory!: number; // RAM aproximada reportada por el navegador en GB (ej. 4, 8, 16)

    @IsString()
    @IsNotEmpty()
    userAgent!: string; // El string identificador del navegador y Sistema Operativo
}

// 2. El contrato principal de la transacción
export class TransactionDto {
    @IsUUID('4') // Forzamos a que el ID de usuario sea un UUID v4 válido
    @IsNotEmpty()
    userId!: string;

    @IsString()
    @IsNotEmpty()
    @Length(16, 19) // El PAN (número de tarjeta) real o tokenizado tiene entre 16 y 19 dígitos
    cardNumberToken!: string;

    @IsNumber()
    @IsPositive() // Un monto de transacción jamás puede ser 0 o negativo (intento de bypass)
    amount!: number;

    @IsString()
    @IsNotEmpty()
    @Length(3, 3) // Moneda en formato ISO 4217, ej: "USD", "ARS"
    currency!: string;

    @IsString()
    @IsNotEmpty()
    deviceId!: string; // ID asignado/previo (ahora lo validaremos contra la telemetría)

    // ⚙️ EDICIÓN: Agregamos el objeto de telemetría obligatoria de hardware
    @IsObject()
    @ValidateNested()
    @Type(() => DeviceTelemetryDto)
    deviceTelemetry!: DeviceTelemetryDto;

    @IsObject()
    @ValidateNested() // Le dice a class-validator que valide las reglas internas de LocationDto
    @Type(() => LocationDto) // Convierte el JSON anidado a una instancia de la clase LocationDto
    location!: LocationDto;
}