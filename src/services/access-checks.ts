import { castId, MonzoAPI } from "@otters/monzo";
import { Env } from "../types";
import { AccessCheckName, recordAccessCheck } from "./access-alerts";
import { logger } from "../logger";

export function getMonzoStatus(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null || !("response" in error))
		return;
	const response = error.response;
	if (
		typeof response === "object" &&
		response !== null &&
		"status" in response &&
		typeof response.status === "number"
	)
		return response.status;
}

export function describeMonzoFailure(
	operation: string,
	error: unknown,
): string {
	const status = getMonzoStatus(error);
	return `${operation} failed${status === undefined ? "" : ` (HTTP ${status})`}.`;
}

export class MonzoAuthenticationError extends Error {
	constructor() {
		super("Monzo authentication was not confirmed for the configured user");
	}
}

async function findLatestTransaction(client: MonzoAPI, accountId: string) {
	const now = Date.now();
	const before = new Date(now).toISOString();
	for (const days of [1, 7, 89]) {
		let since = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
		let latest:
			| Awaited<ReturnType<MonzoAPI["getTransactions"]>>[number]
			| undefined;
		const cursors = new Set<string>();
		for (let page = 0; page < 20; page++) {
			const transactions = await client.getTransactions(
				castId(accountId, "acc"),
				{ limit: 100, since, before },
			);
			for (const transaction of transactions) {
				if (
					!latest ||
					Date.parse(transaction.created) > Date.parse(latest.created) ||
					(transaction.created === latest.created && transaction.id > latest.id)
				)
					latest = transaction;
			}
			if (transactions.length < 100) {
				if (latest) return latest;
				break;
			}
			if (!latest || cursors.has(latest.id))
				throw new Error("Transaction pagination did not advance");
			cursors.add(latest.id);
			since = latest.id;
			if (page === 19) throw new Error("Transaction pagination limit reached");
		}
	}
}

export async function checkAccountAccess(
	env: Env,
	accountId: string,
	userId: string,
	client: MonzoAPI,
): Promise<void> {
	try {
		const identity = await client.whoami();
		if (!identity.authenticated || identity.user_id !== userId)
			throw new MonzoAuthenticationError();
		await recordAccessCheck(env, {
			accountId,
			check: "authentication",
			status: "healthy",
			detail: "Authentication verified for the configured user.",
		});
	} catch (error) {
		await recordAccessCheck(env, {
			accountId,
			check: "authentication",
			status: "unhealthy",
			detail: describeMonzoFailure("Authentication check", error),
		});
		return;
	}

	let operation = "Transaction listing";
	try {
		const latest = await findLatestTransaction(client, accountId);
		if (!latest) {
			await recordAccessCheck(env, {
				accountId,
				check: "transactions",
				status: "untested",
				detail:
					"No transactions in the last 89 days. Individual transaction access was not tested.",
			});
			return;
		}
		operation = "Transaction lookup";
		await client.getTransaction(latest.id);
		await recordAccessCheck(env, {
			accountId,
			check: "transactions",
			status: "healthy",
			detail:
				"Transaction listing and individual lookup verified. Pot transfers were not tested.",
		});
	} catch (error) {
		await recordAccessCheck(env, {
			accountId,
			check: "transactions",
			status: "unhealthy",
			detail: describeMonzoFailure(operation, error),
		});
	}
}

export async function getUserAccountIds(
	env: Env,
	userId: string,
): Promise<string[]> {
	const accounts = await env.DB.prepare(
		"SELECT monzo_account_id FROM monzo_accounts WHERE user_id = ?",
	)
		.bind(userId)
		.all<{ monzo_account_id: string }>();
	return accounts.results.map((account) => account.monzo_account_id);
}

export async function checkUserAccess(
	env: Env,
	userId: string,
	client: MonzoAPI,
): Promise<void> {
	try {
		for (const accountId of await getUserAccountIds(env, userId)) {
			await checkAccountAccess(env, accountId, userId, client);
		}
		logger.info("Monzo read-only access checks completed", { userId });
	} catch {
		logger.error("Could not run Monzo access checks", { userId });
	}
}

export async function recordUserCheck(
	env: Env,
	userId: string,
	check: AccessCheckName,
	status: "healthy" | "unhealthy",
	detail: string,
): Promise<void> {
	try {
		for (const accountId of await getUserAccountIds(env, userId)) {
			await recordAccessCheck(env, { accountId, check, status, detail });
		}
	} catch {
		logger.error("Could not record Monzo user check", { userId, check });
	}
}
