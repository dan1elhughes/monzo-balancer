import { MonzoAPI } from "@otters/monzo";
import { MonzoConfig } from "./types";
import { logger } from "./logger";

export async function balanceAccount(client: MonzoAPI, config: MonzoConfig) {
	const { account_id, pot_id, target_balance } = config;

	// 1. Get Balance
	const balanceData = await client.getBalance(account_id);
	const currentBalance = balanceData.balance;

	logger.info("Checking balance", {
		currentBalance,
		targetBalance: target_balance,
	});

	const diff = currentBalance - target_balance;

	if (diff === 0) {
		logger.info("Balance is exactly on target");
		return;
	}

	const dedupeId = crypto.randomUUID();

	if (diff > 0) {
		// Excess funds: Deposit to Pot
		logger.info("Depositing excess funds", { amount: diff, potId: pot_id });
		await client.depositIntoPot(pot_id, {
			amount: diff,
			dedupe_id: dedupeId,
			source_account_id: account_id,
		});
	} else {
		// Deficit: Withdraw from Pot
		const pots = await client.getPots(account_id);
		const targetPot = pots.find((p) => p.id === pot_id);

		if (!targetPot) {
			throw new Error(`Pot ${pot_id} not found`);
		}

		const withdrawAmount = Math.abs(diff);
		const available = targetPot.balance;

		logger.info("Checking pot balance for withdrawal", {
			potBalance: available,
			needed: withdrawAmount,
		});

		if (available < withdrawAmount) {
			logger.warn("Pot has insufficient funds to cover deficit", {
				available,
				needed: withdrawAmount,
			});
			if (available > 0) {
				await client.withdrawFromPot(pot_id, {
					amount: available,
					dedupe_id: dedupeId,
					destination_account_id: account_id,
				});
			}
		} else {
			logger.info("Withdrawing funds", {
				amount: withdrawAmount,
				potId: pot_id,
			});
			await client.withdrawFromPot(pot_id, {
				amount: withdrawAmount,
				dedupe_id: dedupeId,
				destination_account_id: account_id,
			});
		}
	}
}
