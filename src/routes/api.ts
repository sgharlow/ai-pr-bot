import { FastifyInstance } from 'fastify';

export async function apiRoutes(app: FastifyInstance) {
  app.get('/api/status', async (request, reply) => {
    reply.send({
      status: 'operational',
      version: '0.1.0',
      message: 'AI PR Bot v0 is running'
    });
  });
}
