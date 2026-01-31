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

	// When we have the transaction amount from the API, use it directly
	// to avoid race conditions when multiple transactions arrive simultaneously
	if (transactionAmount !== undefined) {
		if (transactionAmount > 0) {
			// Incoming funds: deposit the transaction amount to pot
			logger.info("Depositing incoming funds to pot", {
				amount: transactionAmount,
				potId: monzo_pot_id,
			});

			if (config.dry_run) {
				logger.info("Dry run enabled, skipping deposit");
				return;
			}

			await client.depositIntoPot(monzo_pot_id, {
				amount: transactionAmount,
				dedupe_id: dedupeId,
				source_account_id: monzo_account_id,
			});
		} else if (transactionAmount < 0) {
			// Outgoing funds: withdraw the absolute amount from pot to cover the spend
			const withdrawAmount = Math.abs(transactionAmount);

			// We still need to check pot balance for available funds
			const pots = await client.getPots(monzo_account_id);
			const targetPot = pots.find((p) => p.id === monzo_pot_id);

			if (!targetPot) {
				throw new Error(`Pot ${monzo_pot_id} not found`);
			}

			const available = targetPot.balance;

			logger.info("Processing outgoing funds", {
				withdrawAmount,
				potBalance: available,
				potId: monzo_pot_id,
			});

			if (available === 0) {
				logger.info("Pot is empty, no withdrawal possible");
				return;
			}

			const actualWithdrawAmount = Math.min(withdrawAmount, available);

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
		// transactionAmount === 0: nothing to do
		return;
	}

	// Fallback: when no transaction amount is provided (shouldn't happen in normal webhook flow),
	// we check the balance to determine excess/deficit
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

	if (diff > 0) {
		// Excess funds: Deposit to Pot
		logger.info("Depositing excess funds", {
			amount: diff,
			potId: monzo_pot_id,
		});

		if (config.dry_run) {
			logger.info("Dry run enabled, skipping deposit");
			return;
		}

		await client.depositIntoPot(monzo_pot_id, {
			amount: diff,
			dedupe_id: dedupeId,
			source_account_id: monzo_account_id,
		});
	} else {
		// Deficit: Withdraw from Pot
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
				if (config.dry_run) {
					logger.info("Dry run enabled, skipping partial withdrawal");
					return;
				}

				await client.withdrawFromPot(monzo_pot_id, {
					amount: available,
					dedupe_id: dedupeId,
					destination_account_id: monzo_account_id,
				});
			}
		} else {
			logger.info("Withdrawing funds", {
				amount: withdrawAmount,
				potId: monzo_pot_id,
			});

			if (config.dry_run) {
				logger.info("Dry run enabled, skipping withdrawal");
				return;
			}

			await client.withdrawFromPot(monzo_pot_id, {
				amount: withdrawAmount,
				dedupe_id: dedupeId,
				destination_account_id: monzo_account_id,
			});
		}
	}
}
