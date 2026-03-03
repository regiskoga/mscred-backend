import { app } from './app';

const startServer = async () => {
    try {
        const port = parseInt(process.env.PORT || '3333', 10);
        const host = process.env.HOST || '0.0.0.0'; // Requerido para rodar dentro do Docker

        await app.listen({ port, host });

        // app.log.info(`Servidor rodando porta ${port}`) -> Já resolvido pelo logger do fastify
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

startServer();
