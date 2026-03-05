import { FastifyReply, FastifyRequest } from 'fastify';
import { DashboardService } from '../../services/dashboard.service';
import { z } from 'zod';

export class DashboardController {
    async getMetrics(request: FastifyRequest, reply: FastifyReply) {
        const dashboardService = new DashboardService();
        const { sub: userId, role, store_id: storeId } = request.user as { sub: string, role: string, store_id: number | null };

        const querySchema = z.object({
            month: z.coerce.number().min(1).max(12).optional(),
            year: z.coerce.number().min(2000).max(2100).optional(),
            consultantId: z.string().uuid().optional(),
            targetStoreId: z.coerce.number().optional()
        });
        const { month, year, consultantId, targetStoreId } = querySchema.parse(request.query);

        try {
            const [workingDays, financialTotals, goalsProgress] = await Promise.all([
                dashboardService.getWorkingDaysMetrics(month, year),
                dashboardService.getFinancialTotals(userId, role, storeId, month, year, consultantId, targetStoreId),
                dashboardService.getGoalsProgress(userId, role, storeId, month, year, consultantId, targetStoreId)
            ]);

            return reply.send({
                workingDays,
                financialTotals,
                goalsProgress
            });
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ message: 'Erro ao compilar métricas do Dashboard.', error: error.message });
        }
    }
}
