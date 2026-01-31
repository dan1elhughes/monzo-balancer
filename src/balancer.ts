import { MonzoAPI } from "@otters/monzo";
import { MonzoAccountConfig } from "./types";
import { logger } from "./logger";

export async function balanceAccount(
	client: MonzoAPI,
	config: MonzoAccountConfig,
	triggeringTransactionId: string,
	transactionAmount?: number,
) {
	const { monzo_account_id, monzo_pot_id, target_balance } = config;

	const dedupeId = `balance-correction-${triggeringTransactionId}`;

	// Determine the transfer amount and direction
	let transferAmount: number;
	let isDeposit: boolean;
	let reason: string;

	if (transactionAmount !== undefined) {
		// Use transaction amount directly to avoid race conditions
		transferAmount = Math.abs(transactionAmount);
		isDeposit = transactionAmount > 0;
		reason =
			transactionAmount > 0
				? "incoming transaction"
				: transactionAmount < 0
					? "outgoing transaction"
					: "zero transaction";

		if (transactionAmount === 0) {
			logger.info("Transaction amount is zero, nothing to do");
			return;
		}
	} else {
		// Fallback: calculate from balance (shouldn't happen in normal webhook flow)
		const [balanceData, pots] = await Promise.all([
			client.getBalance(monzo_account_id),
			client.getPots(monzo_account_id),
		]);
		const currentBalance = balanceData.balance;
		const targetPot = pots.find((p) => p.id === monzo_pot_id);

		if (!targetPot) {
			throw new Error(`Pot ${monzo_pot_id} not found`);
		}

		logger.info("Checking balance", {
			currentBalance,
			targetBalance: target_balance,
		});

		const diff = currentBalance - target_balance;

		if (diff === 0) {
			logger.info("Balance is exactly on target");
			return;
		}

		transferAmount = Math.abs(diff);
		isDeposit = diff > 0;
		reason = isDeposit ? "excess balance" : "balance deficit";

		// For balance-based withdrawals, we need the pot for later
		if (!isDeposit) {
			const available = targetPot.balance;
			if (available === 0) {
				logger.info("Pot is empty, no withdrawal possible");
				return;
			}
			if (available < transferAmount) {
				logger.warn("Pot has insufficient funds to cover deficit", {
					available,
					needed: transferAmount,
				});
				transferAmount = available;
			}
		}
	}

	// Execute the transfer
	if (isDeposit) {
		logger.info(`Depositing funds (${reason})`, {
			amount: transferAmount,
			potId: monzo_pot_id,
		});

		if (config.dry_run) {
			logger.info("Dry run enabled, skipping deposit");
			return;
		}

		await client.depositIntoPot(monzo_pot_id, {
			amount: transferAmount,
			dedupe_id: dedupeId,
			source_account_id: monzo_account_id,
		});
	} else {
		// For withdrawals, we need to check pot availability
		const pots = await client.getPots(monzo_account_id);
		const targetPot = pots.find((p) => p.id === monzo_pot_id);

		if (!targetPot) {
			throw new Error(`Pot ${monzo_pot_id} not found`);
		}

		const available = targetPot.balance;
		const actualWithdrawAmount = Math.min(transferAmount, available);

		if (available === 0) {
			logger.info("Pot is empty, no withdrawal possible");
			return;
		}

		logger.info(`Withdrawing funds (${reason})`, {
			amount: actualWithdrawAmount,
			potBalance: available,
			potId: monzo_pot_id,
		});

		if (config.dry_run) {
			logger.info("Dry run enabled, skipping withdrawal");
			return;
		}

		await client.withdrawFromPot(monzo_pot_id, {
			amount: actualWithdrawAmount,
			dedupe_id: dedupeId,
			destination_account_id: monzo_account_id,
		});
	}
}
