import { Id } from "@otters/monzo";

export interface Env {
	DB: D1Database;
	MONZO_CLIENT_ID: string;
	MONZO_CLIENT_SECRET: string;
	MONZO_REDIRECT_URI: string;
}

export interface AccountConfig {
	access_token: string;
	refresh_token: string;
	client_id: Id<"oauth2client">;
	client_secret: string;
	monzo_account_id: Id<"acc">;
	monzo_pot_id: Id<"pot">;
	target_balance: number; // in pennies
}
