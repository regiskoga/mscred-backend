import { prisma } from '../lib/prisma';

export class DashboardService {
    /**
     * Calcula os dias úteis totais, decorridos e restantes no mês selecionado
     */
    async getWorkingDaysMetrics(paramMonth?: number, paramYear?: number) {
        const now = new Date();
        const year = paramYear || now.getFullYear();
        const month = paramMonth ? paramMonth - 1 : now.getMonth();

        // Limites do Mês Selecionado
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

        // Limite "Hoje" para os Decorridos
        const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
        const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());

        let today;
        if (isCurrentMonth) {
            today = new Date(year, month, now.getDate(), 23, 59, 59);
        } else if (isPastMonth) {
            today = lastDayOfMonth;
        } else {
            today = new Date(year, month, 1, 0, 0, 0); // No futuro não tem dias decorridos "efetivos" ainda
        }

        // Buscar Feriados do Mês
        const holidays = await prisma.holiday.findMany({
            where: {
                date: {
                    gte: firstDayOfMonth,
                    lte: lastDayOfMonth
                }
            }
        });

        // Converter datas de feriado para comparações fáceis (formato YYYY-MM-DD)
        const holidayStrings = holidays.map(h => h.date.toISOString().split('T')[0]);

        const countWorkingDays = (startDate: Date, endDate: Date) => {
            let count = 0;
            const curDate = new Date(startDate.getTime());
            while (curDate <= endDate) {
                const dayOfWeek = curDate.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 0 = Domingo, 6 = Sábado
                const dateString = curDate.toISOString().split('T')[0];
                const isHoliday = holidayStrings.includes(dateString);

                if (!isWeekend && !isHoliday) {
                    count++;
                }
                curDate.setDate(curDate.getDate() + 1);
            }
            return count;
        };

        const totalWorkingDays = countWorkingDays(firstDayOfMonth, lastDayOfMonth);
        const elapsedWorkingDays = countWorkingDays(firstDayOfMonth, today);
        const remainingWorkingDays = totalWorkingDays - elapsedWorkingDays;

        return {
            total: totalWorkingDays,
            elapsed: elapsedWorkingDays,
            remaining: remainingWorkingDays < 0 ? 0 : remainingWorkingDays
        };
    }

    /**
     * Busca os totais financeiros (Comissionamento e Contratos Aprovados e Pagos) do mês
     */
    async getFinancialTotals(userId: string, paramMonth?: number, paramYear?: number) {
        const now = new Date();
        const year = paramYear || now.getFullYear();
        const month = paramMonth ? paramMonth - 1 : now.getMonth();

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

        // Total de comissões acumuladas do usuário neste mês (seja aprovado ou não, normalmente considera tudo digitado, ou só pago. 
        // Vamos agrupar os dois e separar no controller caso a regra mude)
        const comissionAgg = await prisma.attendance.aggregate({
            _sum: { commission_value: true },
            where: {
                user_id: userId,
                attendance_date: {
                    gte: firstDayOfMonth,
                    lte: lastDayOfMonth
                }
            }
        });

        // Total "Pago Aprovado" é o contract_value dos atendimentos onde paid_approved = true
        const paidApprovedAgg = await prisma.attendance.aggregate({
            _sum: { contract_value: true },
            where: {
                user_id: userId,
                paid_approved: true,
                attendance_date: {
                    gte: firstDayOfMonth,
                    lte: lastDayOfMonth
                }
            }
        });

        const commissionValue = comissionAgg._sum && (comissionAgg._sum as any).commission_value
            ? (comissionAgg._sum as any).commission_value : 0;

        const paidApprovedValue = paidApprovedAgg._sum && (paidApprovedAgg._sum as any).contract_value
            ? (paidApprovedAgg._sum as any).contract_value : 0;

        return {
            currentCommission: Number(commissionValue.toFixed(2)),
            paidApproved: Number(paidApprovedValue.toFixed(2))
        };
    }

    /**
     * Compara as Metas configuradas x as Vendas Realizadas do Consultor no mês
     */
    async getGoalsProgress(userId: string, storeId: number | null, paramMonth?: number, paramYear?: number) {
        const now = new Date();
        const year = paramYear || now.getFullYear();
        const monthIndex = paramMonth ? paramMonth - 1 : now.getMonth();
        const monthDB = monthIndex + 1; // Prisma mês = 1 a 12

        const firstDayOfMonth = new Date(year, monthIndex, 1);
        const lastDayOfMonth = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

        // 1. Encontrar todas as metas deste mês (Priorizando as específicas deste usuário, depois desta loja, depois global)
        // Por simplicidade na agregação, trazemos todas que englobam ele e filtramos na memória a prioridade
        const allPossibleGoals = await prisma.goal.findMany({
            where: {
                month: monthDB,
                year,
                OR: [
                    { user_id: userId },
                    { store_id: storeId, user_id: null },
                    { store_id: null, user_id: null }
                ]
            },
            include: {
                product: { select: { name: true } }
            }
        });

        // Filtrar a meta mais específica por produto (Usuário > Loja > Global)
        const uniqueGoalsByProduct = new Map<number, any>();
        for (const goal of allPossibleGoals) {
            const existing = uniqueGoalsByProduct.get(goal.product_id);
            if (!existing) {
                uniqueGoalsByProduct.set(goal.product_id, goal);
            } else {
                // Se já existe, substitui se a atual for mais "específica"
                let currentScore = (existing.user_id ? 3 : (existing.store_id ? 2 : 1));
                let newScore = (goal.user_id ? 3 : (goal.store_id ? 2 : 1));
                if (newScore > currentScore) {
                    uniqueGoalsByProduct.set(goal.product_id, goal);
                }
            }
        }

        const goals = Array.from(uniqueGoalsByProduct.values());

        // 2. Para cada Produto na Meta, somar o que o cara já vendeu (contract_value) no mês
        const progressResults = [];

        for (const goal of goals) {
            const agg = await prisma.attendance.aggregate({
                _sum: { contract_value: true },
                where: {
                    user_id: userId,
                    product_id: goal.product_id,
                    attendance_date: {
                        gte: firstDayOfMonth,
                        lte: lastDayOfMonth
                    }
                }
            });

            const actualSales = agg._sum && (agg._sum as any).contract_value ? (agg._sum as any).contract_value : 0;
            const remainingToGoal = goal.target - actualSales;

            // Buscar em qual Tier atual o usuário está, para mostrar no Frontend (Ex: "Faixa Ouro (2%)")
            const currentTiers = await prisma.commissionTier.findMany({
                where: { product_id: goal.product_id },
                orderBy: { min_value: 'desc' }
            });

            const activeTier = currentTiers.find((t: any) => actualSales >= t.min_value);

            progressResults.push({
                productId: goal.product_id,
                productName: goal.product.name,
                target: goal.target,
                actualSales: Number(actualSales.toFixed(2)),
                remainingToGoal: remainingToGoal > 0 ? Number(remainingToGoal.toFixed(2)) : 0,
                percentageAchieved: Math.min(100, (actualSales / goal.target) * 100),
                currentTierPercentage: activeTier ? activeTier.percentage : 0,
            });
        }

        return progressResults;
    }
}
