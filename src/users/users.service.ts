import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async update(id: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    let passwordHash: string | undefined;
    if (dto.newPassword) {
      if (
        !dto.currentPassword ||
        !(await bcrypt.compare(dto.currentPassword, user.passwordHash))
      ) {
        throw new BadRequestException('A senha atual está incorreta.');
      }
      passwordHash = await bcrypt.hash(dto.newPassword, 12);
    }
    return this.prisma.user.update({
      where: { id },
      data: { name: dto.name?.trim(), passwordHash },
      select: { id: true, name: true, email: true, updatedAt: true },
    });
  }
}
