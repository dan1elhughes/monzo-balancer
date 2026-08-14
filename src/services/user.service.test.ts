// @ts-expect-error The installed Node types predate node:sqlite; Node 26 provides it at runtime.
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Env } from "../types";
import { createMonzoAccountForUser } from "./user.service";

class SqliteD1Database {
	prepareCalls = 0;

	constructor(private readonly database: DatabaseSync) {}

	prepare(sql: string) {
		this.prepareCalls += 1;
		const statement = this.database.prepare(sql);
		let values: unknown[] = [];

		return {
			bind(...boundValues: unknown[]) {
				values = boundValues;
				return this;
			},
			async run() {
				statement.run(...values);
				return { success: true };
			},
			async first<T>() {
				return (statement.get(...values) as T | undefined) ?? null;
			},
		};
	}
}

describe("createMonzoAccountForUser", () => {
	let database: DatabaseSync;
	let d1: SqliteD1Database;
	let mockEnv: Env;

	beforeEach(() => {
		database = new DatabaseSync(":memory:");
		database.exec(`
			CREATE TABLE monzo_accounts (
				id TEXT PRIMARY KEY,
				user_id TEXT,
				monzo_account_id TEXT NOT NULL UNIQUE,
				monzo_pot_id TEXT NOT NULL,
				target_balance INTEGER NOT NULL,
				dry_run INTEGER NOT NULL DEFAULT 0,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);
		d1 = new SqliteD1Database(database);
		mockEnv = {
			DB: d1 as any,
			MONZO_CLIENT_ID: "client_id",
			MONZO_CLIENT_SECRET: "client_secret",
			MONZO_REDIRECT_URI: "http://localhost/oauth/callback",
		};

		vi.spyOn(Date, "now").mockReturnValue(100);
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(
				"initial-id" as `${string}-${string}-${string}-${string}-${string}`,
			)
			.mockReturnValueOnce(
				"replacement-id" as `${string}-${string}-${string}-${string}-${string}`,
			);
	});

	afterEach(() => {
		database.close();
		vi.restoreAllMocks();
	});

	it("inserts or updates settings atomically while preserving account identity", async () => {
		const created = await createMonzoAccountForUser(mockEnv, "initial-user", {
			monzo_account_id: "acc_joint",
			monzo_pot_id: "pot_old",
			target_balance: 100000,
			dry_run: false,
		});

		expect(created).toEqual({
			id: "initial-id",
			user_id: "initial-user",
			monzo_account_id: "acc_joint",
			monzo_pot_id: "pot_old",
			target_balance: 100000,
			dry_run: false,
			created_at: 100,
			updated_at: 100,
		});
		expect(d1.prepareCalls).toBe(1);

		vi.mocked(Date.now).mockReturnValue(200);

		const updated = await createMonzoAccountForUser(mockEnv, "new-user", {
			monzo_account_id: "acc_joint",
			monzo_pot_id: "pot_new",
			target_balance: 125000,
			dry_run: true,
		});

		expect(updated).toEqual({
			id: "initial-id",
			user_id: "new-user",
			monzo_account_id: "acc_joint",
			monzo_pot_id: "pot_new",
			target_balance: 125000,
			dry_run: true,
			created_at: 100,
			updated_at: 200,
		});
		expect(d1.prepareCalls).toBe(2);

		const rows = database
			.prepare("SELECT * FROM monzo_accounts")
			.all() as Record<string, unknown>[];
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: "initial-id",
			user_id: "new-user",
			monzo_pot_id: "pot_new",
			target_balance: 125000,
			dry_run: 1,
			created_at: 100,
			updated_at: 200,
		});
	});
});
