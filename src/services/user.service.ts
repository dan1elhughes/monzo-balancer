import { Env, User, MonzoAccount } from "../types";
import { MonzoAPI } from "@otters/monzo";
import { logger } from "../logger";

/**
 * Get or create a user based on Monzo API user information.
 * Fetches the authenticated user's info from Monzo `/me` endpoint
 * and creates a user record if one doesn't exist.
 *
 * @param env - Environment with database access
 * @param client - Authenticated Monzo API client
 * @returns User object with user_id and timestamps
 * @throws Error if unable to fetch user info or create user record
 */
export async function getOrCreateUser(
	env: Env,
	client: MonzoAPI,
): Promise<User> {
	try {
		// Fetch user info from Monzo API using whoami() endpoint
		// Returns { user_id, authenticated, client_id }
		const userInfo = await client.whoami();
		const monzoUserId = userInfo.user_id;

		if (!monzoUserId) {
			throw new Error("Failed to get user_id from Monzo API");
		}

		logger.info("Fetched user from Monzo API", { user_id: monzoUserId });

		// Check if user already exists in database
		const existingUser = await env.DB.prepare(
			"SELECT * FROM users WHERE user_id = ?",
		)
			.bind(monzoUserId)
			.first<User>();

		if (existingUser) {
			logger.info("User already exists in database", {
				user_id: monzoUserId,
			});
			return existingUser;
		}

		// Create new user
		const now = Date.now();
		const newUser: User = {
			user_id: monzoUserId,
			created_at: now,
			updated_at: now,
		};

		await env.DB.prepare(
			"INSERT INTO users (user_id, created_at, updated_at) VALUES (?, ?, ?)",
		)
			.bind(monzoUserId, now, now)
			.run();

		logger.info("Created new user in database", { user_id: monzoUserId });

		return newUser;
	} catch (error) {
		logger.error("Failed to get or create user", error);
		throw error;
	}
}

/**
 * Fetch all Monzo accounts linked to a user.
 * Useful for future multi-account support.
 *
 * @param env - Environment with database access
 * @param userId - The user_id to fetch accounts for
 * @returns Array of MonzoAccount objects (may be empty)
 */
export async function getUserMonzoAccounts(
	env: Env,
	userId: string,
): Promise<MonzoAccount[]> {
	try {
		const accounts = await env.DB.prepare(
			"SELECT * FROM monzo_accounts WHERE user_id = ? ORDER BY created_at ASC",
		)
			.bind(userId)
			.all<MonzoAccount>();

		logger.info("Fetched user Monzo accounts", {
			user_id: userId,
			count: accounts.results?.length || 0,
		});

		return accounts.results || [];
	} catch (error) {
		logger.error("Failed to fetch user Monzo accounts", error);
		throw error;
	}
}

/**
 * Create a new Monzo account configuration for a user.
 * Used during setup to link a Monzo account to a user.
 *
 * @param env - Environment with database access
 * @param userId - The user_id to associate this account with
 * @param monzoAccountData - The account configuration data
 * @returns The created MonzoAccount object
 */
export async function createMonzoAccountForUser(
	env: Env,
	userId: string,
	monzoAccountData: {
		monzo_account_id: string;
		monzo_pot_id: string;
		target_balance: number;
		access_token: string;
		refresh_token: string;
		dry_run: boolean;
	},
): Promise<MonzoAccount> {
	const id = crypto.randomUUID();
	const now = Date.now();

	const account: MonzoAccount = {
		id,
		user_id: userId,
		monzo_account_id: monzoAccountData.monzo_account_id as any,
		monzo_pot_id: monzoAccountData.monzo_pot_id as any,
		target_balance: monzoAccountData.target_balance,
		access_token: monzoAccountData.access_token,
		refresh_token: monzoAccountData.refresh_token,
		dry_run: monzoAccountData.dry_run,
		created_at: now,
		updated_at: now,
	};

	try {
		await env.DB.prepare(
			`INSERT INTO monzo_accounts 
			 (id, user_id, monzo_account_id, monzo_pot_id, target_balance, access_token, refresh_token, dry_run, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind(
				id,
				userId,
				monzoAccountData.monzo_account_id,
				monzoAccountData.monzo_pot_id,
				monzoAccountData.target_balance,
				monzoAccountData.access_token,
				monzoAccountData.refresh_token,
				monzoAccountData.dry_run ? 1 : 0,
				now,
				now,
			)
			.run();

		logger.info("Created Monzo account for user", {
			user_id: userId,
			account_id: id,
			monzo_account_id: monzoAccountData.monzo_account_id,
		});

		return account;
	} catch (error) {
		logger.error("Failed to create Monzo account for user", error);
		throw error;
	}
}
