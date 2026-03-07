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
        const monthDB = month + 1;

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

        // 1. Obter métricas de dias úteis para os cálculos
        const workingDays = await this.getWorkingDaysMetrics(monthDB, year);

        // RBAC Filter
        const dataWhere: any = {
            attendance_date: {
                gte: firstDayOfMonth,
                lte: lastDayOfMonth
            }
        };

        // Escopo efetivo para busca de metas
        let effectiveUserId = targetUserId || (role === 'OPERADOR' ? userId : null);
        let effectiveStoreId = targetStoreId || (role === 'GESTOR' ? storeId : null);

        if (targetUserId) {
            dataWhere.user_id = targetUserId;
        } else if (targetStoreId) {
            dataWhere.store_id = targetStoreId;
        } else {
            if (role === 'OPERADOR') {
                dataWhere.user_id = userId;
            } else if (role === 'GESTOR' && storeId) {
                dataWhere.store_id = storeId;
            }
        }

        // 1. Buscar todos os produtos ativos
        const products = await prisma.product.findMany({
            where: { active: true },
            select: { id: true, name: true, sort_order: true },
            orderBy: [
                { sort_order: 'asc' },
                { name: 'asc' }
            ]
        });

        // 2. Agrupar Atendimentos Pagos/Aprovados por Produto
        const salesData = await prisma.attendance.groupBy({
            by: ['product_id'],
            _sum: { contract_value: true },
            _count: { id: true },
            where: {
                ...dataWhere,
                paid_approved: true
            }
        });

        // 3. Buscar TODAS as metas possíveis para este período
        const allPossibleGoals = await prisma.goal.findMany({
            where: {
                month: monthDB,
                year,
                OR: [
                    { user_id: effectiveUserId || userId },
                    { store_id: effectiveStoreId || storeId, user_id: null },
                    { store_id: null, user_id: null }
                ]
            }
        });

        // 4. Mesclar dados com lógica de precedência de metas e cálculos de projeção
        const result = products.map(product => {
            const sale = salesData.find(s => s.product_id === product.id);
            const actualSales = Number(sale?._sum?.contract_value || 0);
            const count = sale?._count?.id || 0;

            // Encontrar a melhor meta para este produto (User > Store > Global)
            const productGoals = allPossibleGoals.filter(g => g.product_id === product.id);
            let target = 0;
            if (productGoals.length > 0) {
                const bestGoal = productGoals.reduce((prev, curr) => {
                    const prevScore = (prev.user_id ? 3 : (prev.store_id ? 2 : 1));
                    const currScore = (curr.user_id ? 3 : (curr.store_id ? 2 : 1));
                    return currScore > prevScore ? curr : prev;
                });
                target = Number(bestGoal.target);
            }

            // Cálculos de Performance
            const percentageAchieved = target > 0 ? (actualSales / target) * 100 : 0;

            // Projeção baseada em dias úteis
            // Se o mês já passou (elapsed == total), projeção é o valor atual
            let projection = actualSales;
            let projectionPercentage = percentageAchieved;

            if (workingDays.elapsed > 0 && workingDays.elapsed < workingDays.total) {
                projection = (actualSales / workingDays.elapsed) * workingDays.total;
                projectionPercentage = target > 0 ? (projection / target) * 100 : 0;
            }

            // Ideal Hoje e Saldo
            const idealToday = workingDays.total > 0 ? (target / workingDays.total) * workingDays.elapsed : 0;
            const balance = actualSales - idealToday;

            return {
                productId: product.id,
                productName: product.name,
                totalValue: Number(actualSales.toFixed(2)),
                count,
                target: Number(target.toFixed(2)),
                percentageAchieved: Number(percentageAchieved.toFixed(2)),
                projection: Number(projection.toFixed(2)),
                projectionPercentage: Number(projectionPercentage.toFixed(2)),
                idealToday: Number(idealToday.toFixed(2)),
                balance: Number(balance.toFixed(2))
            };
        });

        return result;
    }

    /**
     * Retorna a evolução mensal dos últimos 6 meses por Produto e por Colaborador
     */
    async getMonthlyEvolution(userId: string, role: string, storeId: number | null, targetStoreId?: number) {
        if (role === 'OPERADOR') return { productEvolution: null, storeEvolution: null, consultantRanking: null };

        const monthsData = [];
        const now = new Date();

        // 1. Definir o escopo da busca
        const baseWhere: any = { paid_approved: true };
        if (targetStoreId) {
            baseWhere.store_id = targetStoreId;
        } else if (role === 'GESTOR' && storeId) {
            baseWhere.store_id = storeId;
        }

        // 2. Coletar dados dos últimos 3 meses
        for (let i = 2; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const first = new Date(d.getFullYear(), d.getMonth(), 1);
            const last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
            const monthLabel = d.toLocaleString('pt-BR', { month: 'short' }).toUpperCase();

            const productSales = await prisma.attendance.groupBy({
                by: ['product_id'],
                _sum: { contract_value: true },
                where: { ...baseWhere, attendance_date: { gte: first, lte: last } }
            });

            const consultantSales = await prisma.attendance.groupBy({
                by: ['user_id'],
                _sum: { contract_value: true },
                where: { ...baseWhere, attendance_date: { gte: first, lte: last } }
            });

            const storeSales = await prisma.attendance.groupBy({
                by: ['store_id'],
                _sum: { contract_value: true },
                where: { ...baseWhere, attendance_date: { gte: first, lte: last } }
            });

            monthsData.push({
                month: monthLabel,
                productSales,
                consultantSales,
                storeSales
            });
        }

        // 3. Buscar Nomes de Referência
        const allProducts = await prisma.product.findMany({
            where: { active: true },
            select: { id: true, name: true, sort_order: true },
            orderBy: [
                { sort_order: 'asc' },
                { name: 'asc' }
            ]
        });
        const operatorRole = await prisma.role.findFirst({ where: { name: 'OPERADOR' } });
        const allUsers = await prisma.user.findMany({
            where: {
                deleted_at: null,
                role_id: operatorRole?.id,
                ...(baseWhere.store_id ? { store_id: baseWhere.store_id } : {})
            },
            select: { id: true, name: true }
        });
        const allStores = await prisma.store.findMany({
            where: baseWhere.store_id ? { id: baseWhere.store_id } : {},
            select: { id: true, name: true }
        });

        // 4. Evolução de Produtos (3 meses)
        const productSeries = monthsData.map(m => {
            const entry: any = { month: m.month };
            allProducts.forEach(p => {
                const sale = m.productSales.find(s => s.product_id === p.id);
                entry[p.name] = sale?._sum?.contract_value || 0;
            });
            return entry;
        });
        const activeProductNames = allProducts
            .filter(p => productSeries.some(entry => entry[p.name] > 0))
            .map(p => p.name);

        // 5. Evolução de Lojas (3 meses)
        const storeSeries = monthsData.map(m => {
            const entry: any = { month: m.month };
            allStores.forEach(s => {
                const sale = m.storeSales.find(ss => ss.store_id === s.id);
                entry[s.name] = sale?._sum?.contract_value || 0;
            });
            return entry;
        });
        const activeStoreNames = allStores
            .filter(s => storeSeries.some(entry => entry[s.name] > 0))
            .map(s => s.name);

        // 6. Ranking de Consultores (Mês Atual)
        const currentMonthData = monthsData[monthsData.length - 1];
        const ranking = allUsers.map(u => {
            const sale = currentMonthData.consultantSales.find(s => s.user_id === u.id);
            return {
                name: u.name,
                value: sale?._sum?.contract_value || 0
            };
        })
            .filter(u => u.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        return {
            productEvolution: { series: productSeries, names: activeProductNames },
            storeEvolution: { series: storeSeries, names: activeStoreNames },
            consultantRanking: ranking
        };
    }
}
