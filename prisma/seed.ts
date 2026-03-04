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

    // 3.5. Feriados Nacionais e Pontos Facultativos (2025/2026)
    const holidays = [
        { date: '2025-01-01', name: 'Confraternização Universal (Feriado Nacional)' },
        { date: '2025-03-03', name: 'Carnaval (Ponto Facultativo)' },
        { date: '2025-03-04', name: 'Carnaval (Ponto Facultativo)' },
        { date: '2025-03-05', name: 'Quarta-feira de Cinzas (Ponto Facultativo até as 14h)' },
        { date: '2025-04-18', name: 'Paixão de Cristo (Feriado Nacional)' },
        { date: '2025-04-21', name: 'Tiradentes (Feriado Nacional)' },
        { date: '2025-05-01', name: 'Dia do Trabalho (Feriado Nacional)' },
        { date: '2025-06-19', name: 'Corpus Christi (Ponto Facultativo)' },
        { date: '2025-09-07', name: 'Independência do Brasil (Feriado Nacional)' },
        { date: '2025-10-12', name: 'Nossa Senhora Aparecida (Feriado Nacional)' },
        { date: '2025-11-02', name: 'Finados (Feriado Nacional)' },
        { date: '2025-11-15', name: 'Proclamação da República (Feriado Nacional)' },
        { date: '2025-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra (Feriado Nacional)' },
        { date: '2025-12-24', name: 'Véspera de Natal (Ponto Facultativo após as 13h)' },
        { date: '2025-12-25', name: 'Natal (Feriado Nacional)' },
        { date: '2025-12-31', name: 'Véspera de Ano Novo (Ponto Facultativo após as 13h)' },
        { date: '2026-01-01', name: 'Confraternização Universal (Feriado Nacional)' },
        { date: '2026-02-16', name: 'Carnaval (Ponto Facultativo)' },
        { date: '2026-02-17', name: 'Carnaval (Ponto Facultativo)' },
        { date: '2026-02-18', name: 'Quarta-feira de Cinzas (Ponto Facultativo até as 14h)' },
        { date: '2026-04-03', name: 'Paixão de Cristo (Feriado Nacional)' },
        { date: '2026-04-21', name: 'Tiradentes (Feriado Nacional)' },
        { date: '2026-05-01', name: 'Dia do Trabalho (Feriado Nacional)' },
        { date: '2026-06-04', name: 'Corpus Christi (Ponto Facultativo)' },
        { date: '2026-09-07', name: 'Independência do Brasil (Feriado Nacional)' },
        { date: '2026-10-12', name: 'Nossa Senhora Aparecida (Feriado Nacional)' },
        { date: '2026-11-02', name: 'Finados (Feriado Nacional)' },
        { date: '2026-11-15', name: 'Proclamação da República (Feriado Nacional)' },
        { date: '2026-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra (Feriado Nacional)' },
        { date: '2026-12-24', name: 'Véspera de Natal (Ponto Facultativo após as 13h)' },
        { date: '2026-12-25', name: 'Natal (Feriado Nacional)' },
        { date: '2026-12-31', name: 'Véspera de Ano Novo (Ponto Facultativo após as 13h)' }
    ];

    for (const h of holidays) {
        const dateObj = new Date(`${h.date}T00:00:00Z`);
        await prisma.holiday.upsert({
            where: { date: dateObj },
            update: { name: h.name },
            create: { name: h.name, date: dateObj }
        });
    }
    console.log(`✅ ${holidays.length} Feriados registrados.`);

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
