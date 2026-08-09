import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(191)
  email!: string;

  @IsString()
  @MinLength(6, { message: 'A senha precisa ter ao menos 6 caracteres.' })
  @MaxLength(128)
  password!: string;
}
