import { MonzoAPI, castId } from '@otters/monzo';
import { Env, MonzoConfig } from './types';

export async function getMonzoConfig(env: Env): Promise<MonzoConfig | null> {
  const accessToken = await env.MONZO_CONFIG.get('MONZO_ACCESS_TOKEN');
  const refreshToken = await env.MONZO_CONFIG.get('MONZO_REFRESH_TOKEN');
  const clientId = await env.MONZO_CONFIG.get('MONZO_CLIENT_ID');
  const clientSecret = env.MONZO_CLIENT_SECRET;
  const accountId = await env.MONZO_CONFIG.get('MONZO_ACCOUNT_ID');
  const potId = await env.MONZO_CONFIG.get('MONZO_POT_ID');
  const targetBalanceStr = await env.MONZO_CONFIG.get('TARGET_BALANCE');

  if (!accessToken || !refreshToken || !clientId || !clientSecret || !accountId || !potId) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    client_id: castId(clientId, 'oauth2client'),
    client_secret: clientSecret,
    account_id: castId(accountId, 'acc'),
    pot_id: castId(potId, 'pot'),
    target_balance: targetBalanceStr ? parseInt(targetBalanceStr, 10) : 100000 // Default £1000
  };
}

export async function saveTokens(env: Env, accessToken: string, refreshToken: string) {
  await env.MONZO_CONFIG.put('MONZO_ACCESS_TOKEN', accessToken);
  await env.MONZO_CONFIG.put('MONZO_REFRESH_TOKEN', refreshToken);
}

export async function withMonzoClient<T>(
  env: Env,
  action: (client: MonzoAPI, config: MonzoConfig) => Promise<T>
): Promise<T> {
  const config = await getMonzoConfig(env);
  if (!config) {
    throw new Error('Missing Monzo Configuration in KV');
  }

  const appCreds = {
    client_id: config.client_id,
    client_secret: config.client_secret,
    redirect_uri: 'http://localhost' // Placeholder, strictly for type satisfaction if needed
  };

  const client = new MonzoAPI(
    {
      access_token: config.access_token,
      refresh_token: config.refresh_token,
    },
    appCreds
  );

  try {
    return await action(client, config);
  } catch (error: any) {
    // Check if it's an authentication error (401)
    // The library uses alistair/http, we'd need to inspect the error object.
    // For now, we'll try to refresh on any error that looks like it might be auth related
    // or just try refresh once on failure.
    console.log('Monzo API call failed, attempting refresh...', error);

    try {
      const newCreds = await client.refresh();
      console.log('Token refreshed successfully');
      
      await saveTokens(env, newCreds.access_token, newCreds.refresh_token);
      
      const refreshedClient = new MonzoAPI(newCreds, appCreds);
      // Update config with new tokens for the callback
      const newConfig = { ...config, ...newCreds };
      
      return await action(refreshedClient, newConfig);
    } catch (refreshError) {
      console.error('Failed to refresh token', refreshError);
      throw refreshError; // Original error or refresh error
    }
  }
}
