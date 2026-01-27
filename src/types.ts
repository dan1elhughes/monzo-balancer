import { Id } from "@otters/monzo";

export interface Env {
	DB: D1Database;
	MONZO_CLIENT_ID: string;
	MONZO_CLIENT_SECRET: string;
	MONZO_REDIRECT_URI: string;
}

/**
 * User identity independent of Monzo account configuration.
 * Enables users to connect multiple Monzo accounts and maintain persistent identity.
 * Tokens are stored at user level (not account level) per Monzo API design.
 */
export interface User {
	user_id: string;
	access_token: string;
	refresh_token: string;
	created_at: number;
	updated_at: number;
}

/**
 * Monzo account configuration stored in database.
 * Includes balancing settings and references the user for authentication tokens.
 * Tokens are stored at user level, not account level (per Monzo API design).
 * Linked to a user via user_id.
 */
export interface MonzoAccount {
	id: string; // Internal UUID, unique per row
	user_id: string; // Links to users.user_id (which has the tokens)
	monzo_account_id: Id<"acc">;
	monzo_pot_id: Id<"pot">;
	target_balance: number; // in pennies
	dry_run: boolean;
	created_at: number;
	updated_at: number;
}

/**
 * Monzo account configuration for runtime use.
 * Excludes sensitive tokens to prevent accidental exposure.
 * Used internally for balancing operations.
 */
export interface MonzoAccountConfig {
	id: string;
	user_id: string;
	monzo_account_id: Id<"acc">;
	monzo_pot_id: Id<"pot">;
	target_balance: number; // in pennies
	dry_run: boolean;
}
