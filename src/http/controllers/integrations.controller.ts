import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { CommissionEngineService } from '../../services/commission-engine.service';

const commissionEngine = new CommissionEngineService();

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

        // Simple CSV parser handling quotes
        const csvData = await response.text();
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let curVal = '';
        let inQuotes = false;

        for (let i = 0; i < csvData.length; i++) {
            const char = csvData[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                currentRow.push(curVal);
                curVal = '';
            } else if (char === '\n' && !inQuotes) {
                currentRow.push(curVal);
                rows.push(currentRow);
                currentRow = [];
                curVal = '';
            } else if (char !== '\r') {
                curVal += char;
            }
        }
        if (curVal || currentRow.length > 0) {
            currentRow.push(curVal);
            rows.push(currentRow);
        }

        if (rows.length < 2) {
            return reply.status(200).send({ message: 'Planilha vazia ou sem dados para sincronizar.' });
        }

        const stats = { created: 0, skipped: 0, errors: 0, errorDetails: [] as string[] };

        // Normalize Headers (lowercase, no accents)
        const normalize = (str: string) => str.trim().replace(/^"|"$/g, '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        let headerRowIndex = -1;
        let idxName = -1, idxCpf = -1, idxDate = -1, idxProduct = -1, idxType = -1, idxStatus = -1, idxChannel = -1, idxCity = -1, idxBank = -1, idxValue = -1;

        for (let i = 0; i < Math.min(rows.length, 100); i++) {
            const currentHeaders = rows[i].map(normalize);

            const getColIndex = (possibleNames: string[]) => {
                return currentHeaders.findIndex(h => possibleNames.some(name => h.includes(normalize(name))));
            };

            const tempIdxName = getColIndex(['nome', 'cliente', 'customer']);
            const tempIdxCpf = getColIndex(['cpf', 'documento']);

            if (tempIdxName !== -1 && tempIdxCpf !== -1) {
                headerRowIndex = i;
                idxName = tempIdxName;
                idxCpf = tempIdxCpf;
                idxDate = getColIndex(['data', 'date']);
                idxProduct = getColIndex(['produto', 'product']);
                idxType = getColIndex(['tipo', 'operacao', 'type']);
                idxStatus = getColIndex(['status', 'situacao', 'situação', 'pagamento', 'estado']);
                idxChannel = getColIndex(['canal', 'channel']);
                idxCity = getColIndex(['cidade', 'city', 'local']);
                idxBank = getColIndex(['banco', 'bank', 'origem']);
                idxValue = getColIndex(['valor', 'value', 'contrato', 'bruto', 'producao', 'montante', 'bruto']);
                break;
            }
        }

        if (headerRowIndex === -1) {
            return reply.status(400).send({ message: 'Colunas obrigatórias não encontradas (Nome e CPF). Verifique o cabeçalho da planilha.' });
        }

        // Prefetch relations for performance
        const products = await prisma.product.findMany({ select: { id: true, name: true } });
        const types = await prisma.operationType.findMany({ select: { id: true, name: true } });
        const statuses = await prisma.attendanceStatus.findMany({ select: { id: true, name: true } });
        const channels = await prisma.salesChannel.findMany({ select: { id: true, name: true } });

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            // Skip totally empty rows
            if (row.every(c => !c.trim())) continue;

            const getValue = (idx: number) => idx >= 0 && idx < row.length ? row[idx].trim().replace(/^"|"$/g, '') : '';

            const customer_name = getValue(idxName) || 'Não Informado';
            const customer_cpf = getValue(idxCpf);
            const date_str = getValue(idxDate);
            const product_name = getValue(idxProduct);
            const type_name = getValue(idxType);
            const status_name = getValue(idxStatus);
            const channel_name = getValue(idxChannel);
            const city = getValue(idxCity);
            const origin_bank = getValue(idxBank);
            const value_str = getValue(idxValue);

            // Somente bloqueia se o Documento (CPF/CNPJ) estiver em branco!
            if (!customer_cpf) continue;

            let is_paid = false;
            const sLower = status_name.toLowerCase();
            if (sLower.includes('pago') || sLower.includes('liquidado') || sLower.includes('aprovado') || sLower.includes('concluido') || sLower.includes('concluído')) {
                is_paid = true;
            }

            let contract_value = 0;
            if (value_str) {
                // Remove R$, espaços, e converte para número
                const cleaned = value_str.toUpperCase().replace('R$', '').trim();
                const numStr = cleaned.replace(/\s+/g, ''); // remove espaços no meio
                if (numStr.includes(',') && numStr.includes('.')) {
                    contract_value = parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
                } else if (numStr.includes(',')) {
                    contract_value = parseFloat(numStr.replace(',', '.'));
                } else {
                    contract_value = parseFloat(numStr);
                }
                if (isNaN(contract_value)) contract_value = 0;
            }

            // Generate external_id to prevent duplicates (SheetID + RowIndex)
            const external_id = `${user.google_sheet_id}_${i}`;

            // Check if already exists
            const existing = await prisma.attendance.findUnique({ where: { external_id } });
            if (existing) {
                stats.skipped++;
                continue;
            }

            // Normalization helper for catalog matching (ignores case and accents)
            const n = (str: string) => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : '';

            // Find Relations (Case and Accent Insensitive Match) or Create fallback if blank
            let product = product_name ? products.find(p => n(p.name) === n(product_name)) : products.find(p => p.name === 'Não Informado');
            if (!product && !product_name) {
                product = await prisma.product.create({ data: { name: 'Não Informado' } });
                products.push(product);
            }

            let type = type_name ? types.find(t => n(t.name) === n(type_name)) : types.find(t => t.name === 'Não Informado');
            if (!type && !type_name) {
                type = await prisma.operationType.create({ data: { name: 'Não Informado' } });
                types.push(type);
            }

            let status = status_name ? statuses.find(s => n(s.name) === n(status_name)) : statuses.find(s => s.name === 'Não Informado');
            if (!status && !status_name) {
                status = await prisma.attendanceStatus.create({ data: { name: 'Não Informado' } });
                statuses.push(status);
            }

            let channel = channel_name ? channels.find(c => n(c.name) === n(channel_name)) : channels.find(c => c.name === 'Não Informado');
            if (!channel && !channel_name) {
                channel = await prisma.salesChannel.create({ data: { name: 'Não Informado' } });
                channels.push(channel);
            }

            if (!product || !type || !status || !channel) {
                stats.errors++;
                let missingMssg = `Linha ${i + 1} (${customer_name}): Falha ao mapear catálogos porque eles não existem no sistema. `;
                if (!product) missingMssg += `Produto "${product_name}" não encontrado. `;
                if (!type) missingMssg += `Tipo "${type_name}" não encontrado. `;
                if (!status) missingMssg += `Status "${status_name}" não encontrado. `;
                if (!channel) missingMssg += `Canal "${channel_name}" não encontrado. `;
                stats.errorDetails.push(missingMssg);
                continue;
            }

            let final_date = new Date();
            let date_is_valid = true;

            if (date_str) {
                const cleanDate = date_str.split(/[ T_]/)[0].trim();

                let year: number | undefined;
                let month: number | undefined;
                let day: number | undefined;

                if (cleanDate.includes('/')) {
                    const parts = cleanDate.split('/');
                    if (parts.length === 3) {
                        if (parts[2].length === 4 || parts[2].length === 2) { // DD/MM/YYYY ou MM/DD/YYYY ou DD/MM/YY
                            year = parseInt(parts[2], 10);
                            if (year < 100) year += 2000;

                            const p0 = parseInt(parts[0], 10);
                            const p1 = parseInt(parts[1], 10);

                            if (p0 > 12) {
                                day = p0; month = p1 - 1;
                            } else if (p1 > 12) {
                                month = p0 - 1; day = p1;
                            } else {
                                day = p0; month = p1 - 1; // Padrão BR default
                            }
                        } else if (parts[0].length === 4) { // YYYY/MM/DD
                            year = parseInt(parts[0], 10);
                            month = parseInt(parts[1], 10) - 1;
                            day = parseInt(parts[2], 10);
                        }
                    }
                } else if (cleanDate.includes('-')) {
                    const parts = cleanDate.split('-');
                    if (parts.length === 3) {
                        if (parts[0].length === 4) { // YYYY-MM-DD
                            year = parseInt(parts[0], 10);
                            month = parseInt(parts[1], 10) - 1;
                            day = parseInt(parts[2], 10);
                        } else { // DD-MM-YYYY
                            year = parseInt(parts[2], 10);
                            if (year < 100) year += 2000;
                            day = parseInt(parts[0], 10);
                            month = parseInt(parts[1], 10) - 1;
                        }
                    }
                }

                if (year !== undefined && month !== undefined && day !== undefined) {
                    // Fixar 12:00 UTC para evitar que a conversão de Fuso Horário Local reduza 1 dia quando exibido no Frontend (BRT)
                    const parsed = new Date(Date.UTC(year, month, day, 12, 0, 0));
                    if (!isNaN(parsed.getTime())) final_date = parsed;
                    else date_is_valid = false;
                } else {
                    const parsed = new Date(date_str);
                    if (!isNaN(parsed.getTime())) {
                        final_date = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0));
                    }
                    else date_is_valid = false;
                }
            }

            const year = final_date.getFullYear();
            if (!date_is_valid || year < 1900 || year > 2100) {
                stats.errors++;
                stats.errorDetails.push(`Linha ${i + 1} (${customer_name}): Data inválida ou ano absurdo detectado (${date_str}). Corrija a data na planilha.`);
                continue;
            }

            try {
                let commission_value = 0;
                if (contract_value > 0) {
                    commission_value = await commissionEngine.calculateCommission(
                        user.id,
                        product.id,
                        contract_value,
                        final_date
                    );
                }

                await prisma.attendance.create({
                    data: {
                        customer_name,
                        customer_cpf: customer_cpf.replace(/\D/g, ''),
                        attendance_date: final_date,
                        product_id: product.id,
                        operation_type_id: type.id,
                        attendance_status_id: status.id,
                        sales_channel_id: channel.id,
                        city: city || 'Não Informado',
                        origin_bank: origin_bank || null,
                        paid_approved: is_paid,
                        contract_value,
                        commission_value,
                        external_id,
                        user_id: user.id,
                        store_id: user.store_id!,
                    },
                });
                stats.created++;
            } catch (err: any) {
                stats.errors++;
                stats.errorDetails.push(`Linha ${i + 1} (${customer_name}): Erro ao salvar no banco (${err.message}).`);
            }
        }

        // Audit Trail for bulk sync
        await prisma.auditLog.create({
            data: {
                user_id: (request.user as any).sub,
                action: 'INSERT',
                table_name: 'attendances',
                record_id: 'bulk_sync_google_sheets',
                new_payload: { user_id, stats: { created: stats.created, skipped: stats.skipped, errors: stats.errors } },
                ip_address: request.ip,
            },
        });

        return reply.send({ message: 'Sincronização concluída.', stats });

    } catch (error: any) {
        return reply.status(500).send({ message: `Erro no sincronismo: ${error.message}` });
    }
}

export async function clearGoogleSheetsSync(request: FastifyRequest, reply: FastifyReply) {
    const paramsSchema = z.object({
        user_id: z.string().uuid(),
    });
    const { user_id } = paramsSchema.parse(request.params);

    try {
        const result = await prisma.attendance.deleteMany({
            where: {
                user_id,
                external_id: { not: null } // Apaga apenas os importados via Planilha
            }
        });

        // Audit Trail
        await prisma.auditLog.create({
            data: {
                user_id,
                action: 'DELETE',
                table_name: 'attendances',
                record_id: 'bulk_clear_google_sheets',
                new_payload: { deleted_count: result.count },
                ip_address: request.ip,
            },
        });

        return reply.send({ message: `${result.count} atendimentos importados foram excluídos com sucesso. Você já pode sincronizar novamente.` });
    } catch (error: any) {
        return reply.status(500).send({ message: `Erro ao limpar sincronização: ${error.message}` });
    }
}
