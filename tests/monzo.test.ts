import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMonzoConfig, saveTokens } from '../src/monzo';
import { Env } from '../src/types';

describe('Monzo Configuration', () => {
    const mockKV = {
        get: vi.fn(),
        put: vi.fn(),
    };
    
    const mockEnv: Env = {
        MONZO_CONFIG: mockKV as any,
        MONZO_CLIENT_SECRET: 'test_secret'
    };

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns null if any required config is missing', async () => {
        mockKV.get.mockResolvedValue(null);
        
        const config = await getMonzoConfig(mockEnv);
        expect(config).toBeNull();
    });

    it('returns config object when all keys exist', async () => {
        mockKV.get.mockImplementation(async (key: string) => {
            const values: Record<string, string> = {
                'MONZO_ACCESS_TOKEN': 'access',
                'MONZO_REFRESH_TOKEN': 'refresh',
                'MONZO_CLIENT_ID': 'oauth2client_123',
                'MONZO_ACCOUNT_ID': 'acc_123',
                'MONZO_POT_ID': 'pot_123',
                'TARGET_BALANCE': '2000'
            };
            return values[key] ?? null;
        });

        const config = await getMonzoConfig(mockEnv);

        expect(config).not.toBeNull();
        expect(config?.access_token).toBe('access');
        expect(config?.target_balance).toBe(2000);
        expect(config?.client_secret).toBe('test_secret');
    });

    it('uses default target balance if not specified', async () => {
         mockKV.get.mockImplementation(async (key: string) => {
            const values: Record<string, string> = {
                'MONZO_ACCESS_TOKEN': 'access',
                'MONZO_REFRESH_TOKEN': 'refresh',
                'MONZO_CLIENT_ID': 'oauth2client_123',
                'MONZO_ACCOUNT_ID': 'acc_123',
                'MONZO_POT_ID': 'pot_123',
                // TARGET_BALANCE missing
            };
            return values[key] ?? null;
        });

        const config = await getMonzoConfig(mockEnv);
        expect(config?.target_balance).toBe(100000); // Default 100000
    });
});

describe('saveTokens', () => {
    const mockKV = {
        get: vi.fn(),
        put: vi.fn(),
    };
    
    const mockEnv: Env = {
        MONZO_CONFIG: mockKV as any,
        MONZO_CLIENT_SECRET: 'test_secret'
    };

    it('saves access and refresh tokens to KV', async () => {
        await saveTokens(mockEnv, 'new_access', 'new_refresh');

        expect(mockKV.put).toHaveBeenCalledWith('MONZO_ACCESS_TOKEN', 'new_access');
        expect(mockKV.put).toHaveBeenCalledWith('MONZO_REFRESH_TOKEN', 'new_refresh');
    });
});
