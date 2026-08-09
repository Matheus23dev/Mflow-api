import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async setupStatus() {
    return { needsSetup: (await this.prisma.user.count()) === 0 };
  }

  async register(dto: RegisterDto) {
    if (await this.prisma.user.count()) {
      throw new ConflictException('O administrador inicial já foi criado.');
    }
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(dto.password, 12),
      },
      select: { id: true, name: true, email: true },
    });
    return this.session(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }
    return this.session({ id: user.id, name: user.name, email: user.email });
  }

  private async session(user: { id: string; name: string; email: string }) {
    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        email: user.email,
      }),
      user,
    };
  }
}
