import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('--- INICIANDO MIGRAÇÃO DE DADOS (SEED) ---');

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
    console.log('✅ RBAC Roles inseridos.');

    // 2. Criar o Usuário Administrador Principal
    const adminPassword = await hash('123456', 8);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@mscred.com.br' },
        update: { password_hash: adminPassword }, // Update ensures password reset if run again
        create: {
            name: 'Administrador Master',
            email: 'admin@mscred.com.br',
            password_hash: adminPassword,
            role_id: adminRole.id,
        },
    });
    console.log('✅ Usuário Master validado.');

    // 3. Inserir Catálogos Estáticos Requisitados pelo Negócio

    // 3.1. Produtos
    const products = [
        'CNC', 'CARD', 'CARD BENEFICIO', 'FGTS', 'BMG MED',
        'EMISSAO CARDS', 'CLT', 'CONSIGNADO BMG', 'CONSIGNADO DIVERSOS',
        'ANTECIPACAO BENEFICIO', 'PORTABILIDADE BMG'
    ];
    for (const name of products) {
        await prisma.product.upsert({
            where: { name },
            update: {},
            create: { name }
        });
    }
    console.log(`✅ ${products.length} Produtos registrados.`);

    // 3.2. Status da Proposta
    const statuses = ['A desbloquear', 'Análise', 'Pago', 'Aprovado', 'Negado', 'Novo'];
    for (const name of statuses) {
        await prisma.attendanceStatus.upsert({
            where: { name },
            update: {},
            create: { name }
        });
    }
    console.log(`✅ ${statuses.length} Statuses de proposta registrados.`);

    // 3.3. Tipo de Operação
    const operations = ['NOVO', 'SUPERCONTA', 'REFIN', 'EMISSAO', 'SAQUE'];
    for (const name of operations) {
        await prisma.operationType.upsert({
            where: { name },
            update: {},
            create: { name }
        });
    }
    console.log(`✅ ${operations.length} Tipos de operação registrados.`);

    // 3.4. Canal de Venda
    const channels = [
        'Espontaneo', 'discadora', 'dna', 'lambe', 'rede social',
        'ligou em loja', 'indicação', 'panfletagem', 'carteira',
        'disparo', 'listagem', 'supervisão'
    ];
    for (const name of channels) {
        await prisma.salesChannel.upsert({
            where: { name },
            update: {},
            create: { name }
        });
    }
    console.log(`✅ ${channels.length} Canais de Venda configurados.`);

    console.log('\nSeed executado com sucesso!');
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
