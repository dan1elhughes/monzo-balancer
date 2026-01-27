import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMonzoConfig, saveTokens } from "../src/services/monzo";
import { Env } from "../src/types";
import { castId } from "@otters/monzo";

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
		};
		mockStmt.first.mockResolvedValue(mockAccount);

		const config = await getMonzoConfig(mockEnv, accountId);

		expect(config).not.toBeNull();
		expect(config?.access_token).toBe("access");
		expect(config?.refresh_token).toBe("refresh");
		expect(config?.target_balance).toBe(2000);
		expect(config?.monzo_account_id).toBe("acc_123");
		expect(config?.user_id).toBe("user_123");
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
		await saveTokens(mockEnv, userId, "new_access", "new_refresh");

		expect(mockDB.prepare).toHaveBeenCalledWith(
			"UPDATE users SET access_token = ?, refresh_token = ?, updated_at = ? WHERE user_id = ?",
		);
		expect(mockStmt.bind).toHaveBeenCalledWith(
			"new_access",
			"new_refresh",
			expect.any(Number),
			userId,
		);
		expect(mockStmt.run).toHaveBeenCalled();
	});
});
