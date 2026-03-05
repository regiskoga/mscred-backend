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
    /**
     * Busca os totais financeiros (Comissionamento e Contratos Aprovados e Pagos) do mês
     */
    async getFinancialTotals(userId: string, role: string, storeId: number | null, paramMonth?: number, paramYear?: number, targetUserId?: string, targetStoreId?: number) {
        const now = new Date();
        const year = paramYear || now.getFullYear();
        const month = paramMonth ? paramMonth - 1 : now.getMonth();

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

        // RBAC Filter: Definir o escopo da busca
        const whereClause: any = {
            attendance_date: {
                gte: firstDayOfMonth,
                lte: lastDayOfMonth
            }
        };

        // Prioridade 1: Filtro explícito (Admin/Gestor selecionou alguém)
        if (targetUserId) {
            whereClause.user_id = targetUserId;
        } else if (targetStoreId) {
            whereClause.store_id = targetStoreId;
        }
        // Prioridade 2: Filtro por Role (Caso não tenha filtro explícito)
        else {
            if (role === 'OPERADOR') {
                whereClause.user_id = userId;
            } else if (role === 'GESTOR' && storeId) {
                whereClause.store_id = storeId;
            }
        }

        const comissionAgg = await prisma.attendance.aggregate({
            _sum: { commission_value: true },
            where: whereClause
        });

        const paidApprovedAgg = await prisma.attendance.aggregate({
            _sum: { contract_value: true },
            where: {
                ...whereClause,
                paid_approved: true,
            }
        });

        const commissionValue = comissionAgg._sum && (comissionAgg._sum as any).commission_value
            ? (comissionAgg._sum as any).commission_value : 0;

        const paidApprovedValue = paidApprovedAgg._sum && (paidApprovedAgg._sum as any).contract_value
            ? (paidApprovedAgg._sum as any).contract_value : 0;

        return {
            currentCommission: Number(commissionValue.toFixed(2)),
            paidApproved: Number(paidApprovedValue.toFixed(2)),
        };
    }

    /**
     * Compara as Metas configuradas x as Vendas Realizadas do Consultor no mês
     */
    async getGoalsProgress(userId: string, role: string, storeId: number | null, paramMonth?: number, paramYear?: number, targetUserId?: string, targetStoreId?: number) {
        const now = new Date();
        const year = paramYear || now.getFullYear();
        const monthIndex = paramMonth ? paramMonth - 1 : now.getMonth();
        const monthDB = monthIndex + 1;

        const firstDayOfMonth = new Date(year, monthIndex, 1);
        const lastDayOfMonth = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

        // Define quem é o "sujeito" da meta (Para saber quais vendas contar)
        const baseWhere: any = {
            attendance_date: {
                gte: firstDayOfMonth,
                lte: lastDayOfMonth
            }
        };

        let effectiveUserId = targetUserId || (role === 'OPERADOR' ? userId : null);
        let effectiveStoreId = targetStoreId || (role === 'GESTOR' ? storeId : null);

        if (effectiveUserId) baseWhere.user_id = effectiveUserId;
        else if (effectiveStoreId) baseWhere.store_id = effectiveStoreId;

        // 1. Encontrar métricas aplicáveis ao contexto
        const allPossibleGoals = await prisma.goal.findMany({
            where: {
                month: monthDB,
                year,
                OR: [
                    { user_id: effectiveUserId || userId },
                    { store_id: effectiveStoreId || storeId, user_id: null },
                    { store_id: null, user_id: null }
                ]
            },
            include: {
                product: { select: { name: true } }
            }
        });

        const uniqueGoalsByProduct = new Map<number, any>();
        for (const goal of allPossibleGoals) {
            const existing = uniqueGoalsByProduct.get(goal.product_id);
            if (!existing) {
                uniqueGoalsByProduct.set(goal.product_id, goal);
            } else {
                let currentScore = (existing.user_id ? 3 : (existing.store_id ? 2 : 1));
                let newScore = (goal.user_id ? 3 : (goal.store_id ? 2 : 1));
                if (newScore > currentScore) {
                    uniqueGoalsByProduct.set(goal.product_id, goal);
                }
            }
        }

        const goals = Array.from(uniqueGoalsByProduct.values());
        const progressResults = [];

        for (const goal of goals) {
            const agg = await prisma.attendance.aggregate({
                _sum: { contract_value: true },
                where: {
                    ...baseWhere,
                    product_id: goal.product_id,
                }
            });

            const actualSales = agg._sum && (agg._sum as any).contract_value ? (agg._sum as any).contract_value : 0;
            const remainingToGoal = goal.target - actualSales;
            const percentageAchieved = goal.target > 0 ? Math.min(100, (actualSales / goal.target) * 100) : 0;

            const currentTiers = await prisma.commissionTier.findMany({
                where: { product_id: goal.product_id },
                orderBy: { min_value: 'desc' }
            });

            const activeTier = currentTiers.find((t: any) => actualSales >= t.min_value);

            progressResults.push({
                productId: goal.product_id,
                productName: goal.product?.name || 'Produto Não Identificado',
                target: goal.target,
                actualSales: Number(actualSales.toFixed(2)),
                remainingToGoal: remainingToGoal > 0 ? Number(remainingToGoal.toFixed(2)) : 0,
                percentageAchieved: Number(percentageAchieved.toFixed(2)),
                currentTierPercentage: activeTier ? activeTier.percentage : 0,
            });
        }

        return progressResults;
    }

    /**
     * Retorna o resumo de vendas agrupado por produto (Soma de Valor e Contagem)
     */
    async getSalesByProduct(userId: string, role: string, storeId: number | null, paramMonth?: number, paramYear?: number, targetUserId?: string, targetStoreId?: number) {
        const now = new Date();
        const year = paramYear || now.getFullYear();
        const month = paramMonth ? paramMonth - 1 : now.getMonth();

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

        // RBAC Filter
        const whereClause: any = {
            attendance_date: {
                gte: firstDayOfMonth,
                lte: lastDayOfMonth
            }
        };

        if (targetUserId) {
            whereClause.user_id = targetUserId;
        } else if (targetStoreId) {
            whereClause.store_id = targetStoreId;
        } else {
            if (role === 'OPERADOR') {
                whereClause.user_id = userId;
            } else if (role === 'GESTOR' && storeId) {
                whereClause.store_id = storeId;
            }
        }

        // 1. Buscar todos os produtos ativos para garantir que apareçam na lista (mesmo com zero)
        const products = await prisma.product.findMany({
            where: { active: true },
            select: { id: true, name: true }
        });

        // 2. Agrupar Atendimentos Pagos/Aprovados por Produto
        const salesData = await prisma.attendance.groupBy({
            by: ['product_id'],
            _sum: { contract_value: true },
            _count: { id: true },
            where: {
                ...whereClause,
                paid_approved: true // Contar apenas o que foi efetivado
            }
        });

        // 3. Mesclar dados
        const result = products.map(product => {
            const data = salesData.find(s => s.product_id === product.id);
            return {
                productId: product.id,
                productName: product.name,
                totalValue: data?._sum?.contract_value || 0,
                count: data?._count?.id || 0
            };
        });

        // Ordenar por valor total (ou nome)
        return result.sort((a, b) => b.totalValue - a.totalValue);
    }

    /**
     * Retorna a evolução mensal dos últimos 6 meses por Produto e por Colaborador
     */
    async getMonthlyEvolution(userId: string, role: string, storeId: number | null, targetStoreId?: number) {
        // Apenas Admin e Gestor podem ver evolução. Operator não solicitou (vê o dele?) 
        // Mas a regra diz: "Admin vê tudo, Gestor vê a loja"
        if (role === 'OPERADOR') return { products: [], consultants: [] };

        const monthsData = [];
        const now = new Date();

        // 1. Definir o escopo da busca
        const baseWhere: any = { paid_approved: true };
        if (targetStoreId) {
            baseWhere.store_id = targetStoreId;
        } else if (role === 'GESTOR' && storeId) {
            baseWhere.store_id = storeId;
        }

        // 2. Coletar dados dos últimos 6 meses
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const first = new Date(d.getFullYear(), d.getMonth(), 1);
            const last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
            const monthLabel = d.toLocaleString('pt-BR', { month: 'short' }).toUpperCase();

            // Vendas por Produto neste mês
            const productSales = await prisma.attendance.groupBy({
                by: ['product_id'],
                _sum: { contract_value: true },
                where: {
                    ...baseWhere,
                    attendance_date: { gte: first, lte: last }
                }
            });

            // Vendas por Consultor neste mês
            const consultantSales = await prisma.attendance.groupBy({
                by: ['user_id'],
                _sum: { contract_value: true },
                where: {
                    ...baseWhere,
                    attendance_date: { gte: first, lte: last }
                }
            });

            monthsData.push({
                month: monthLabel,
                year: d.getFullYear(),
                monthIndex: d.getMonth() + 1,
                productSales,
                consultantSales
            });
        }

        // 3. Transformar para o formato que o gráfico espera (Series)
        // Precisamos dos nomes
        const allProducts = await prisma.product.findMany({ where: { active: true }, select: { id: true, name: true } });

        // FILTRAR APENAS OPERADORES (Role ID 3 costuma ser OPERADOR, mas vamos buscar pelo nome pra ser Seguro)
        const operatorRole = await prisma.role.findFirst({ where: { name: 'OPERADOR' } });

        const allUsers = await prisma.user.findMany({
            where: {
                deleted_at: null,
                role_id: operatorRole?.id, // FILTRO SOLICITADO: APENAS OPERADORES
                ...(baseWhere.store_id ? { store_id: baseWhere.store_id } : {})
            },
            select: { id: true, name: true }
        });

        // 4. Mapear evolução de produtos e identificar os que tem dados
        const productEvolution = monthsData.map(m => {
            const entry: any = { month: m.month };
            allProducts.forEach(p => {
                const sale = m.productSales.find(s => s.product_id === p.id);
                entry[p.name] = sale?._sum?.contract_value || 0;
            });
            return entry;
        });

        // Limpeza: Manter apenas produtos que tiveram pelo menos uma venda no período de 6 meses
        const activeProductNames = allProducts
            .filter(p => productEvolution.some(entry => entry[p.name] > 0))
            .map(p => p.name);

        // 5. Mapear evolução de consultores e identificar os que tem dados
        const consultantEvolution = monthsData.map(m => {
            const entry: any = { month: m.month };
            allUsers.forEach(u => {
                const sale = m.consultantSales.find(s => s.user_id === u.id);
                entry[u.name] = sale?._sum?.contract_value || 0;
            });
            return entry;
        });

        // Limpeza: Manter apenas consultores que tiveram pelo menos uma venda no período
        const activeConsultantNames = allUsers
            .filter(u => consultantEvolution.some(entry => entry[u.name] > 0))
            .map(u => u.name);

        return {
            products: productEvolution,
            consultants: consultantEvolution,
            productNames: activeProductNames,
            consultantNames: activeConsultantNames
        };
    }
}
