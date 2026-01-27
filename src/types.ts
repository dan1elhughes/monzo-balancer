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
 */
export interface User {
	user_id: string;
	created_at: number;
	updated_at: number;
}

/**
 * Monzo account configuration stored in database.
 * Includes authentication tokens and balancing settings.
 * Linked to a user via user_id.
 */
export interface MonzoAccount {
	id: string; // Internal UUID, unique per row
	user_id: string; // Links to users.user_id
	monzo_account_id: Id<"acc">;
	monzo_pot_id: Id<"pot">;
	target_balance: number; // in pennies
	access_token: string;
	refresh_token: string;
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

/**
 * @deprecated Use MonzoAccountConfig instead
 * Kept for backward compatibility during migration
 */
export interface AccountConfig {
	access_token: string;
	refresh_token: string;
	monzo_account_id: Id<"acc">;
	monzo_pot_id: Id<"pot">;
	target_balance: number; // in pennies
	dry_run: boolean;
}
