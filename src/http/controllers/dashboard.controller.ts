import { FastifyReply, FastifyRequest } from 'fastify';
import { DashboardService } from '../../services/dashboard.service';

export class DashboardController {
    async getMetrics(request: FastifyRequest, reply: FastifyReply) {
        const dashboardService = new DashboardService();
        const { sub: userId, store_id: storeId } = request.user as { sub: string, store_id: number | null };

        try {
            const [workingDays, financialTotals, goalsProgress] = await Promise.all([
                dashboardService.getWorkingDaysMetrics(),
                dashboardService.getFinancialTotals(userId),
                dashboardService.getGoalsProgress(userId, storeId)
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
