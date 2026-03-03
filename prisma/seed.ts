import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    // 1. Criar Papéis de Acesso Corporativo (Zero-Trust RBAC)
    const adminRole = await prisma.role.upsert({
        where: { name: 'ADMIN' },
        update: {},
        create: { name: 'ADMIN' },
    });

    await prisma.role.upsert({
        where: { name: 'GESTOR' },
        update: {},
        create: { name: 'GESTOR' },
    });

    await prisma.role.upsert({
        where: { name: 'OPERADOR' },
        update: {},
        create: { name: 'OPERADOR' },
    });

    // 2. Criar o Usuário Administrador Principal
    const adminPassword = await hash('123456', 8);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@mscred.com.br' },
        update: {},
        create: {
            name: 'Administrador Master',
            email: 'admin@mscred.com.br',
            password_hash: adminPassword,
            role_id: adminRole.id,
        },
    });

    console.log('Seed executado com sucesso!');
    console.log('--- CREDENCIAIS DE ACESSO ---');
    console.log('E-mail:', admin.email);
    console.log('Senha: 123456');
    console.log('⚠️ Recomenda-se alterar essa senha no primeiro acesso.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
