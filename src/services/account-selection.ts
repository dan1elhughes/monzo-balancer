import { MonzoAPI } from "@otters/monzo";
import { logger } from "../logger";

export interface AccountWithData {
	id: string;
	description: string;
	type: string;
	pots: any[];
	balance: any;
}

export async function fetchAccountsWithData(
	client: MonzoAPI,
): Promise<AccountWithData[]> {
	logger.info("Fetching accounts...");
	let accounts;
	try {
		accounts = await client.getAccounts();
		logger.info("Accounts fetched successfully", { count: accounts.length });
	} catch (e) {
		logger.error("Failed to fetch accounts", e);
		throw e;
	}

	// Fetch pots and balances for all accounts
	const accountsWithData = await Promise.all(
		accounts.map(async (acc) => {
			try {
				const [pots, balance] = await Promise.all([
					client.getPots(acc.id),
					client.getBalance(acc.id).catch((e) => {
						logger.error(`Failed to fetch balance for account ${acc.id}`, e);
						return { balance: 0, currency: "GBP" };
					}),
				]);
				return { ...acc, pots, balance: balance as any };
			} catch (e) {
				logger.error(`Failed to fetch data for account ${acc.id}`, e);
				return { ...acc, pots: [], balance: { balance: 0, currency: "GBP" } };
			}
		}),
	);

	return accountsWithData;
}
