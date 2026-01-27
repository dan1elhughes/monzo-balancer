import { MonzoAPI, Models, Currency } from "@otters/monzo";
import { logger } from "../logger";

export interface AccountWithData extends Models.Account {
	pots: Models.Pot[];
	balance: Models.Balance;
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

	const emptyBalance: Models.Balance = {
		balance: 0,
		total_balance: 0,
		balance_including_flexible_savings: 0,
		currency: "GBP" as Currency,
		spend_today: 0,
		local_currency: "",
		local_exchange_rate: 1,
		local_spend: [],
	};

	// Fetch pots and balances for all accounts
	const accountsWithData = await Promise.all(
		accounts.map(async (acc) => {
			try {
				const [pots, balance] = await Promise.all([
					client.getPots(acc.id),
					client.getBalance(acc.id).catch((e) => {
						logger.error(`Failed to fetch balance for account ${acc.id}`, e);
						return emptyBalance;
					}),
				]);
				return { ...acc, pots, balance };
			} catch (e) {
				logger.error(`Failed to fetch data for account ${acc.id}`, e);
				return { ...acc, pots: [], balance: emptyBalance };
			}
		}),
	);

	return accountsWithData;
}
