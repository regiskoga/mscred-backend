import { FastifyReply, FastifyRequest } from 'fastify';
import { DashboardService } from '../../services/dashboard.service';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export class DashboardController {
    async getMetrics(request: FastifyRequest, reply: FastifyReply) {
        const dashboardService = new DashboardService();
        const { sub: userId, role, store_id: storeId } = request.user as { sub: string, role: string, store_id: number | null };

        const querySchema = z.object({
            month: z.coerce.number().min(1).max(12).optional(),
            year: z.coerce.number().min(2000).max(2100).optional()
        });
        const { month, year } = querySchema.parse(request.query);

        try {
            const [workingDays, financialTotals, goalsProgress] = await Promise.all([
                dashboardService.getWorkingDaysMetrics(month, year),
                dashboardService.getFinancialTotals(userId, role, storeId, month, year),
                dashboardService.getGoalsProgress(userId, role, storeId, month, year)
            ]);

            const debugData = {
                timestamp: new Date().toISOString(),
                user: { userId, role, storeId },
                request: { month, year },
                response: { workingDays, financialTotals, totalInDB: (financialTotals as any).totalRecords, goalsProgressCount: goalsProgress.length }
            };

            fs.writeFileSync(
                'C:/Users/tradr/Documents/antigravity/MSCRED/dashboard_debug.json',
                JSON.stringify(debugData, null, 2)
            );

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
