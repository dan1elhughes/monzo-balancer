import { Env } from './types';
import { withMonzoClient } from './monzo';
import { balanceAccount } from './balancer';
import { logger } from './logger';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Parse body to log and verify event type
    try {
      const body = await request.json() as any;
      
      if (body.type !== 'transaction.created') {
        logger.info('Received non-transaction event', { type: body.type });
        return new Response('Ignored event type', { status: 200 });
      }
      
      logger.info('Received transaction.created event', { transactionId: body.data?.id });
      
      // We don't necessarily need the transaction amount from the webhook, 
      // because we just check the current balance against the target.
      // This handles race conditions better (e.g. multiple transactions coming in).
      
    } catch (e) {
      logger.error('Error parsing webhook body', e);
      return new Response('Bad Request', { status: 400 });
    }

    // Trigger balancing logic asynchronously
    ctx.waitUntil(
      withMonzoClient(env, async (client, config) => {
        await balanceAccount(client, config);
      }).catch(err => {
        logger.error('Balancing logic failed', err);
      })
    );

    return new Response('OK', { status: 200 });
  }
};
