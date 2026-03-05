const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const total = await prisma.attendance.count();
        console.log('Total Attendances:', total);

        const roles = await prisma.role.findMany();
        console.log('Roles:', JSON.stringify(roles, null, 2));

        const stores = await prisma.store.findMany();
        console.log('Stores Count:', stores.length);

        const latest = await prisma.attendance.findMany({
            take: 3,
            orderBy: { attendance_date: 'desc' },
            select: {
                customer_name: true,
                attendance_date: true,
                contract_value: true,
                paid_approved: true
            }
        });
        console.log('Latest 3 Attendances:', JSON.stringify(latest, null, 2));

        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0, 23, 59, 59);

        const monthTarget = await prisma.attendance.count({
            where: {
                attendance_date: {
                    gte: firstDay,
                    lte: lastDay
                }
            }
        });
        console.log(`Attendances in current month (${month + 1}/${year}):`, monthTarget);

    } catch (err) {
        console.error('Error during inspection:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
