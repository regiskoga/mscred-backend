import { prisma } from '../lib/prisma';

export class CommissionEngineService {
    /**
     * Calcula o valor da comissão de um contrato baseado no volume total do usuário no mês para o produto
     */
    async calculateCommission(
        userId: string,
        productId: number,
        contractValue: number,
        attendanceDate: Date
    ): Promise<number> {
        if (contractValue <= 0) return 0;

        const dateObj = new Date(attendanceDate);
        const start = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
        const end = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0, 23, 59, 59, 999);

        // 1. Calcular volume total (Atendimentos Aprovados e Não Aprovados entram no volume? 
        // Normalmente para comissão conta apenas o que está sendo digitado ou aprovado. Vamos considerar todos deste mês)
        const aggregations = await prisma.attendance.aggregate({
            _sum: {
                contract_value: true,
            },
            where: {
                user_id: userId,
                product_id: productId,
                attendance_date: {
                    gte: start,
                    lte: end,
                }
            }
        });

        // O volume final inclui o valor deste novo contrato
        const sumValue = aggregations._sum && (aggregations._sum as any).contract_value ? (aggregations._sum as any).contract_value : 0;
        const totalVolume = sumValue + contractValue;

        // 2. Buscar Tiers de Comissão para este produto ordenados do maior para o menor min_value
        const tiers = await prisma.commissionTier.findMany({
            where: { product_id: productId },
            orderBy: { min_value: 'desc' }
        });

        if (tiers.length === 0) {
            return 0; // Se não tem regra de comissão, retorna 0
        }

        // 3. Descobrir a faixa atingida pelo volume total
        const matchedTier = tiers.find((tier: any) => totalVolume >= tier.min_value);

        if (!matchedTier) {
            // Se o volume não atingiu nem o mínimo da menor faixa
            return 0;
        }

        // 4. Calcular R$ de comissão (Percentual sobre o valor DO CONTRATO atual)
        // NOTA: Em modelagens financeiras comuns, atingir nova faixa pode gerar recalculo 
        // retroativo de tudo, ou aplicar a taxa apenas no contrato atual. Assumindo a aplicação pro contrato atual:
        const commissionValue = (contractValue * matchedTier.percentage) / 100;

        return Number(commissionValue.toFixed(2));
    }
}
