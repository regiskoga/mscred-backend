import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../../lib/prisma';

export async function getHolidays(request: FastifyRequest, reply: FastifyReply) {
    const holidays = await prisma.holiday.findMany({
        orderBy: { date: 'asc' },
    });

    return reply.status(200).send({ holidays });
}
