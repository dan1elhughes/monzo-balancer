import { Id } from '@otters/monzo';

export interface Env {
  MONZO_CONFIG: KVNamespace;
  MONZO_CLIENT_SECRET: string;
}

export interface MonzoConfig {
  access_token: string;
  refresh_token: string;
  client_id: Id<'oauth2client'>;
  client_secret: string;
  account_id: Id<'acc'>;
  pot_id: Id<'pot'>;
  target_balance: number; // in pennies
}

