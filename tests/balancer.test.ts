import { describe, it, expect, vi, beforeEach } from "vitest";
import { balanceAccount } from "../src/balancer";
import { MonzoAccountConfig } from "../src/types";
import { castId } from "@otters/monzo";

describe("balanceAccount", () => {
	const mockClient = {
		getBalance: vi.fn(),
		depositIntoPot: vi.fn(),
		getPots: vi.fn(),
		withdrawFromPot: vi.fn(),
	};

	const config: MonzoAccountConfig = {
		id: "uuid_123",
		user_id: "user_123",
		monzo_account_id: castId("acc_123", "acc"),
		monzo_pot_id: castId("pot_456", "pot"),
		target_balance: 1000, // £10.00
		dry_run: false,
	};

	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe("with positive transaction amount (incoming funds)", () => {
		it("deposits the transaction amount directly without checking balance", async () => {
			// When we have a positive transaction amount, deposit exactly that amount
			// This avoids race conditions when multiple transactions arrive simultaneously
			await balanceAccount(mockClient as any, config, "tx_123", 75000);

			// Should NOT check balance or pots for incoming funds
			expect(mockClient.getBalance).not.toHaveBeenCalled();
			expect(mockClient.getPots).not.toHaveBeenCalled();

			// Should deposit the exact transaction amount
			expect(mockClient.depositIntoPot).toHaveBeenCalledWith(
				config.monzo_pot_id,
				expect.objectContaining({
					amount: 75000,
					dedupe_id: "balance-correction-tx_123",
					source_account_id: config.monzo_account_id,
				}),
			);
			expect(mockClient.withdrawFromPot).not.toHaveBeenCalled();
		});

		it("skips deposit when dry_run is true", async () => {
			const dryRunConfig = { ...config, dry_run: true };

			await balanceAccount(mockClient as any, dryRunConfig, "tx_123", 50000);

			expect(mockClient.depositIntoPot).not.toHaveBeenCalled();
			expect(mockClient.getBalance).not.toHaveBeenCalled();
			expect(mockClient.getPots).not.toHaveBeenCalled();
		});
	});

	describe("without transaction amount (fallback to balance check)", () => {
		it("does nothing when balance equals target", async () => {
			mockClient.getBalance.mockResolvedValue({ balance: 1000 });
			mockClient.getPots.mockResolvedValue([
				{ id: config.monzo_pot_id, balance: 0 },
			]);

			await balanceAccount(mockClient as any, config, "tx_123");

			expect(mockClient.depositIntoPot).not.toHaveBeenCalled();
			expect(mockClient.withdrawFromPot).not.toHaveBeenCalled();
		});

		it("deposits excess funds into pot when balance > target", async () => {
			mockClient.getBalance.mockResolvedValue({ balance: 1500 }); // £15.00
			mockClient.getPots.mockResolvedValue([
				{ id: config.monzo_pot_id, balance: 0 },
			]);

			await balanceAccount(mockClient as any, config, "tx_123");

			expect(mockClient.depositIntoPot).toHaveBeenCalledWith(
				config.monzo_pot_id,
				expect.objectContaining({
					amount: 500,
					source_account_id: config.monzo_account_id,
				}),
			);
			expect(mockClient.withdrawFromPot).not.toHaveBeenCalled();
		});

		it("withdraws funds from pot when balance < target", async () => {
			mockClient.getBalance.mockResolvedValue({ balance: 800 }); // £8.00
			mockClient.getPots.mockResolvedValue([
				{ id: config.monzo_pot_id, balance: 5000 }, // Pot has plenty
			]);

			await balanceAccount(mockClient as any, config, "tx_123");

			expect(mockClient.withdrawFromPot).toHaveBeenCalledWith(
				config.monzo_pot_id,
				expect.objectContaining({
					amount: 200,
					destination_account_id: config.monzo_account_id,
				}),
			);
			expect(mockClient.depositIntoPot).not.toHaveBeenCalled();
		});

		it("withdraws all available funds from pot when pot has insufficient funds", async () => {
			mockClient.getBalance.mockResolvedValue({ balance: 500 }); // £5.00, need 500
			mockClient.getPots.mockResolvedValue([
				{ id: config.monzo_pot_id, balance: 300 }, // Pot only has 300
			]);

			await balanceAccount(mockClient as any, config, "tx_123");

			expect(mockClient.withdrawFromPot).toHaveBeenCalledWith(
				config.monzo_pot_id,
				expect.objectContaining({
					amount: 300,
					destination_account_id: config.monzo_account_id,
				}),
			);
		});

		it("throws error if pot not found", async () => {
			mockClient.getBalance.mockResolvedValue({ balance: 800 });
			mockClient.getPots.mockResolvedValue([]); // No pots

			await expect(
				balanceAccount(mockClient as any, config, "tx_123"),
			).rejects.toThrow(/Pot .* not found/);
		});

		it("uses deterministic dedupe_id when triggeringTransactionId is provided", async () => {
			mockClient.getBalance.mockResolvedValue({ balance: 1500 });
			mockClient.getPots.mockResolvedValue([
				{ id: config.monzo_pot_id, balance: 0 },
			]);
			const txId = "tx_12345";

			await balanceAccount(mockClient as any, config, txId);

			expect(mockClient.depositIntoPot).toHaveBeenCalledWith(
				config.monzo_pot_id,
				expect.objectContaining({
					dedupe_id: `balance-correction-${txId}`,
				}),
			);
		});

		it("skips deposit when dry_run is true", async () => {
			mockClient.getBalance.mockResolvedValue({ balance: 1500 });
			mockClient.getPots.mockResolvedValue([
				{ id: config.monzo_pot_id, balance: 0 },
			]);
			const dryRunConfig = { ...config, dry_run: true };

			await balanceAccount(mockClient as any, dryRunConfig, "tx_123");

			expect(mockClient.depositIntoPot).not.toHaveBeenCalled();
		});

		it("skips withdrawal when dry_run is true", async () => {
			mockClient.getBalance.mockResolvedValue({ balance: 800 });
			mockClient.getPots.mockResolvedValue([
				{ id: config.monzo_pot_id, balance: 5000 },
			]);
			const dryRunConfig = { ...config, dry_run: true };

			await balanceAccount(mockClient as any, dryRunConfig, "tx_123");

			expect(mockClient.withdrawFromPot).not.toHaveBeenCalled();
		});
	}); // Close "without transaction amount" describe
}); // Close main describe
