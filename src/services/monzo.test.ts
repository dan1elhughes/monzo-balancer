import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClient, getMonzoConfig, saveTokens } from "./monzo";
import { Env } from "../types";
import { castId, MonzoAPI } from "@otters/monzo";
import { logger } from "../logger";

describe("Monzo Configuration", () => {
	const mockStmt = {
		bind: vi.fn().mockReturnThis(),
		first: vi.fn(),
		run: vi.fn(),
	};

	const mockDB = {
		prepare: vi.fn().mockReturnValue(mockStmt),
	};

	const mockEnv: Env = {
		DB: mockDB as any,
		MONZO_CLIENT_ID: "client_id",
		MONZO_CLIENT_SECRET: "test_secret",
		MONZO_REDIRECT_URI: "http://localhost",
	};

	const accountId = castId("acc_123", "acc");

	beforeEach(() => {
		vi.resetAllMocks();
		mockDB.prepare.mockReturnValue(mockStmt);
		mockStmt.bind.mockReturnThis();
	});

	it("returns null if account not found", async () => {
		mockStmt.first.mockResolvedValue(null);

		const config = await getMonzoConfig(mockEnv, accountId);
		expect(config).toBeNull();
		expect(mockDB.prepare).toHaveBeenCalledWith(
			expect.stringContaining("JOIN users u ON ma.user_id = u.user_id"),
		);
		expect(mockStmt.bind).toHaveBeenCalledWith(accountId);
	});

	it("returns config object with tokens when account exists", async () => {
		const mockAccount = {
			id: "uuid_123",
			user_id: "user_123",
			monzo_account_id: "acc_123",
			monzo_pot_id: "pot_123",
			target_balance: 2000,
			dry_run: 0,
			created_at: 1234567890,
			updated_at: 1234567890,
			access_token: "access",
			refresh_token: "refresh",
			token_expires_at: 1234567890,
		};
		mockStmt.first.mockResolvedValue(mockAccount);

		const config = await getMonzoConfig(mockEnv, accountId);

		expect(config).not.toBeNull();
		expect(config?.access_token).toBe("access");
		expect(config?.refresh_token).toBe("refresh");
		expect(config?.target_balance).toBe(2000);
		expect(config?.monzo_account_id).toBe("acc_123");
		expect(config?.user_id).toBe("user_123");
		expect(config?.token_expires_at).toBe(1234567890);
	});
});

describe("saveTokens", () => {
	const mockStmt = {
		bind: vi.fn().mockReturnThis(),
		run: vi.fn(),
	};

	const mockDB = {
		prepare: vi.fn(),
	};

	const mockEnv: Env = {
		DB: mockDB as any,
		MONZO_CLIENT_ID: "client_id",
		MONZO_CLIENT_SECRET: "test_secret",
		MONZO_REDIRECT_URI: "http://localhost",
	};

	const userId = "user_123";

	beforeEach(() => {
		vi.resetAllMocks();
		mockDB.prepare.mockReturnValue(mockStmt);
		mockStmt.bind.mockReturnThis();
	});

	it("saves access and refresh tokens to user in DB", async () => {
		await saveTokens(mockEnv, userId, "new_access", "new_refresh", 1234567890);

		expect(mockDB.prepare).toHaveBeenCalledWith(
			"UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = ? WHERE user_id = ?",
		);
		expect(mockStmt.bind).toHaveBeenCalledWith(
			"new_access",
			"new_refresh",
			1234567890,
			expect.any(Number),
			userId,
		);
		expect(mockStmt.run).toHaveBeenCalled();
	});
});

describe("getClient token validation diagnostics", () => {
	const mockStmt = {
		bind: vi.fn().mockReturnThis(),
		first: vi.fn(),
		run: vi.fn(),
	};
	const mockDB = { prepare: vi.fn() };
	const mockEnv: Env = {
		DB: mockDB as any,
		MONZO_CLIENT_ID: "oauth2client_123",
		MONZO_CLIENT_SECRET: "test_secret",
		MONZO_REDIRECT_URI: "http://localhost",
	};
	const config = {
		id: "uuid_123",
		user_id: "user_123",
		monzo_account_id: "acc_123",
		monzo_pot_id: "pot_123",
		target_balance: 2000,
		dry_run: 0,
		created_at: 1234567890,
		updated_at: 1234567890,
		access_token: "secret-access-token",
		refresh_token: "secret-refresh-token",
		token_expires_at: 1_700_000_060_000,
	};

	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
		mockDB.prepare.mockReturnValue(mockStmt);
		mockStmt.bind.mockReturnThis();
		mockStmt.first.mockResolvedValue(config);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("logs the authenticated user and stored token expiry", async () => {
		vi.spyOn(MonzoAPI.prototype, "whoami").mockResolvedValue({
			authenticated: true,
			client_id: castId("oauth2client_123", "oauth2client"),
			user_id: castId("user_123", "user"),
		});
		const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);

		await getClient(mockEnv, castId("acc_123", "acc"));

		expect(info).toHaveBeenCalledWith("Monzo token validation completed", {
			accountId: "acc_123",
			userId: "user_123",
			authenticated: true,
			authenticatedUserId: "user_123",
			tokenExpiresAt: 1_700_000_060_000,
			tokenExpired: false,
			tokenExpiresInMs: 60_000,
		});
	});

	it("records an unauthenticated result without logging secrets or refreshing", async () => {
		vi.spyOn(MonzoAPI.prototype, "whoami").mockResolvedValue({
			authenticated: false,
			client_id: castId("oauth2client_123", "oauth2client"),
			user_id: castId("user_123", "user"),
		});
		const refresh = vi.spyOn(MonzoAPI.prototype, "refresh");
		const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);

		const result = await getClient(mockEnv, castId("acc_123", "acc"));

		expect(result.client).toBeInstanceOf(MonzoAPI);
		expect(refresh).not.toHaveBeenCalled();
		const serializedLogs = JSON.stringify(info.mock.calls);
		expect(serializedLogs).toContain('"authenticated":false');
		expect(serializedLogs).not.toContain("secret-access-token");
		expect(serializedLogs).not.toContain("secret-refresh-token");
	});
});
