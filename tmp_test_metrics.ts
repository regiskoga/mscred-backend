import { DashboardService } from './src/services/dashboard.service';
import { prisma } from './src/lib/prisma';

async function testMetrics() {
    const service = new DashboardService();
    console.log('--- TESTANDO MÉTRICAS DO DASHBOARD ---');

    // Simular um usuário ADMIN
    const metrics = await service.getSalesByProduct('dummy-id', 'ADMIN', null);

    console.log('Produtos processados:', metrics.length);
    metrics.forEach(m => {
        console.log(`[${m.productName}]`);
        console.log(`  Atual: ${m.totalValue}`);
        console.log(`  Meta: ${m.target}`);
        console.log(`  Ideal Hoje: ${m.idealToday}`);
        console.log(`  Saldo: ${m.balance}`);
        console.log(`  Projeção: ${m.projection} (${m.projectionPercentage}%)`);
    });

    await prisma.$disconnect();
}

testMetrics().catch(console.error);
