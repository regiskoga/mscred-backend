import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export async function updateUserSheetId(request: FastifyRequest, reply: FastifyReply) {
    const paramsSchema = z.object({
        id: z.string().uuid(),
    });

    const bodySchema = z.object({
        google_sheet_id: z.string().min(1),
    });

    const { id } = paramsSchema.parse(request.params);
    const { google_sheet_id } = bodySchema.parse(request.body);

    const user = await prisma.user.findUnique({
        where: { id },
    });

    if (!user) {
        return reply.status(404).send({ message: 'Usuário não encontrado.' });
    }

    await prisma.user.update({
        where: { id },
        data: { google_sheet_id },
    });

    // Auditoria (AuditLog)
    await prisma.auditLog.create({
        data: {
            user_id: (request.user as any).sub,
            action: 'UPDATE',
            table_name: 'users',
            record_id: id,
            new_payload: { google_sheet_id },
            ip_address: request.ip,
        },
    });

    return reply.status(204).send();
}

export async function syncGoogleSheets(request: FastifyRequest, reply: FastifyReply) {
    const bodySchema = z.object({
        user_id: z.string().uuid(),
    });

    const { user_id } = bodySchema.parse(request.body);

    const user = await prisma.user.findUnique({
        where: { id: user_id },
        include: { store: true },
    });

    if (!user || !user.google_sheet_id) {
        return reply.status(400).send({ message: 'Usuário não encontrado ou sem Planilha vinculada.' });
    }

    if (!user.store_id) {
        return reply.status(400).send({ message: 'Usuário não possui loja vinculada.' });
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${user.google_sheet_id}/export?format=csv`;

    try {
        const response = await fetch(sheetUrl);
        if (!response.ok) {
            throw new Error(`Falha ao buscar planilha: ${response.statusText}`);
        }

        const csvData = await response.text();
        const rows = csvData.split('\n').map(row => row.split(','));

        // Header Check (Basic validation)
        // Expected columns: Nome, CPF, Data, Produto, Tipo, Status, Canal, Cidade, Banco
        if (rows.length < 2) {
            return reply.status(200).send({ message: 'Planilha vazia ou sem dados para sincronizar.' });
        }

        const stats = { created: 0, skipped: 0, errors: 0 };

        // Prefetch relations for performance
        const products = await prisma.product.findMany({ select: { id: true, name: true } });
        const types = await prisma.operationType.findMany({ select: { id: true, name: true } });
        const statuses = await prisma.attendanceStatus.findMany({ select: { id: true, name: true } });
        const channels = await prisma.salesChannel.findMany({ select: { id: true, name: true } });

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length < 9) continue; // Skip malformed rows

            const [customer_name, customer_cpf, date_str, product_name, type_name, status_name, channel_name, city, origin_bank] = row.map(s => s?.trim().replace(/^"|"$/g, ''));

            if (!customer_name || !customer_cpf) continue;

            // Generate external_id to prevent duplicates (SheetID + RowIndex)
            const external_id = `${user.google_sheet_id}_${i}`;

            // Check if already exists
            const existing = await prisma.attendance.findUnique({ where: { external_id } });
            if (existing) {
                stats.skipped++;
                continue;
            }

            // Find Relations (Case Insensitive Match)
            const product = products.find(p => p.name.toLowerCase() === product_name?.toLowerCase());
            const type = types.find(t => t.name.toLowerCase() === type_name?.toLowerCase());
            const status = statuses.find(s => s.name.toLowerCase() === status_name?.toLowerCase());
            const channel = channels.find(c => c.name.toLowerCase() === channel_name?.toLowerCase());

            if (!product || !type || !status || !channel) {
                stats.errors++;
                continue;
            }

            try {
                await prisma.attendance.create({
                    data: {
                        customer_name,
                        customer_cpf: customer_cpf.replace(/\D/g, ''),
                        attendance_date: new Date(date_str || new Date()),
                        product_id: product.id,
                        operation_type_id: type.id,
                        attendance_status_id: status.id,
                        sales_channel_id: channel.id,
                        city: city || 'Não Informado',
                        origin_bank: origin_bank || null,
                        external_id,
                        user_id: user.id,
                        store_id: user.store_id!,
                    },
                });
                stats.created++;
            } catch (err) {
                stats.errors++;
            }
        }

        // Audit Trail for bulk sync
        await prisma.auditLog.create({
            data: {
                user_id: (request.user as any).sub,
                action: 'INSERT',
                table_name: 'attendances',
                record_id: 'bulk_sync_google_sheets',
                new_payload: { user_id, stats },
                ip_address: request.ip,
            },
        });

        return reply.send({ message: 'Sincronização concluída.', stats });

    } catch (error: any) {
        return reply.status(500).send({ message: `Erro no sincronismo: ${error.message}` });
    }
}
