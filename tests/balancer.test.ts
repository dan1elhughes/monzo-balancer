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

	describe("with negative transaction amount (outgoing funds)", () => {
		it("withdraws the transaction amount from pot", async () => {
			mockClient.getPots.mockResolvedValue([
				{ id: config.monzo_pot_id, balance: 5000 }, // Pot has plenty
			]);

			// Spend of £50.00
			await balanceAccount(mockClient as any, config, "tx_123", -5000);

			// Should check pot balance but NOT account balance
			expect(mockClient.getBalance).not.toHaveBeenCalled();
			expect(mockClient.getPots).toHaveBeenCalled();

			// Should withdraw the absolute transaction amount
			expect(mockClient.withdrawFromPot).toHaveBeenCalledWith(
				config.monzo_pot_id,
				expect.objectContaining({
					amount: 5000,
					dedupe_id: "balance-correction-tx_123",
					destination_account_id: config.monzo_account_id,
				}),
			);
			expect(mockClient.depositIntoPot).not.toHaveBeenCalled();
		});

		it("withdraws partial amount when pot has insufficient funds", async () => {
			mockClient.getPots.mockResolvedValue([
				{ id: config.monzo_pot_id, balance: 300 }, // Pot only has £3.00
			]);

			// Spend of £50.00
			await balanceAccount(mockClient as any, config, "tx_123", -5000);

			// Should only withdraw what's available
			expect(mockClient.withdrawFromPot).toHaveBeenCalledWith(
				config.monzo_pot_id,
				expect.objectContaining({
					amount: 300,
					destination_account_id: config.monzo_account_id,
				}),
			);
		});

		it("does nothing when pot is empty", async () => {
			mockClient.getPots.mockResolvedValue([
				{ id: config.monzo_pot_id, balance: 0 },
			]);

			await balanceAccount(mockClient as any, config, "tx_123", -5000);

			expect(mockClient.withdrawFromPot).not.toHaveBeenCalled();
			expect(mockClient.depositIntoPot).not.toHaveBeenCalled();
		});

		it("skips withdrawal when dry_run is true", async () => {
			mockClient.getPots.mockResolvedValue([
				{ id: config.monzo_pot_id, balance: 5000 },
			]);
			const dryRunConfig = { ...config, dry_run: true };

			await balanceAccount(mockClient as any, dryRunConfig, "tx_123", -5000);

			expect(mockClient.withdrawFromPot).not.toHaveBeenCalled();
			expect(mockClient.getBalance).not.toHaveBeenCalled();
		});

		it("throws error if pot not found", async () => {
			mockClient.getPots.mockResolvedValue([]); // No pots

			await expect(
				balanceAccount(mockClient as any, config, "tx_123", -5000),
			).rejects.toThrow(/Pot .* not found/);
		});
	});

	describe("with zero transaction amount", () => {
		it("does nothing", async () => {
			await balanceAccount(mockClient as any, config, "tx_123", 0);

			expect(mockClient.depositIntoPot).not.toHaveBeenCalled();
			expect(mockClient.withdrawFromPot).not.toHaveBeenCalled();
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

	describe("race condition prevention", () => {
		// Helper to create a deferred promise we can resolve manually
		// This gives us precise control over when mock API calls complete
		function createDeferred<T>(): {
			promise: Promise<T>;
			resolve: (value: T) => void;
		} {
			let resolveFn: (value: T) => void;
			const promise = new Promise<T>((resolve) => {
				resolveFn = resolve;
			});
			return { promise, resolve: resolveFn! };
		}

		it("two simultaneous webhooks each only transfer their specific transaction amount", async () => {
			// This test simulates the exact race condition from the bug report:
			// Two £750 transfers arrive simultaneously. With the old balance-based
			// approach, both would see £1500 excess and try to transfer £1500 each.
			// With the transaction-amount approach, each only transfers £750.

			const deferredA = createDeferred<void>();
			const deferredB = createDeferred<void>();
			const depositedAmounts: number[] = [];
			let callIndex = 0;

			// Mock depositIntoPot to capture amounts and wait on deferred promises
			// This simulates a slow API that hasn't responded yet
			mockClient.depositIntoPot.mockImplementation(
				async (_potId: string, params: { amount: number }) => {
					depositedAmounts.push(params.amount);
					const currentCall = callIndex++;
					// First call waits on deferredA, second on deferredB
					await (currentCall === 0 ? deferredA.promise : deferredB.promise);
				},
			);

			// Start both operations (they'll hang waiting for the deferred promises)
			const promiseA = balanceAccount(mockClient as any, config, "tx_A", 75000);
			const promiseB = balanceAccount(mockClient as any, config, "tx_B", 75000);

			// At this point, both operations are "in flight" but blocked
			// The amounts should already be captured before we resolve
			expect(depositedAmounts).toHaveLength(2);
			expect(depositedAmounts[0]).toBe(75000);
			expect(depositedAmounts[1]).toBe(75000);

			// Now resolve both deferred promises to let the operations complete
			deferredA.resolve();
			deferredB.resolve();

			// Wait for both to finish
			await Promise.all([promiseA, promiseB]);

			// Verify the results
			expect(mockClient.depositIntoPot).toHaveBeenCalledTimes(2);

			// Total deposited should be exactly £1500 (75000 + 75000 in pennies)
			// NOT £3000 which would happen if both tried to transfer the combined amount
			const totalDeposited = depositedAmounts.reduce((a, b) => a + b, 0);
			expect(totalDeposited).toBe(150000);

			// Verify each call used the correct dedupe_id and amount
			expect(mockClient.depositIntoPot).toHaveBeenCalledWith(
				config.monzo_pot_id,
				expect.objectContaining({
					dedupe_id: "balance-correction-tx_A",
					amount: 75000,
				}),
			);
			expect(mockClient.depositIntoPot).toHaveBeenCalledWith(
				config.monzo_pot_id,
				expect.objectContaining({
					dedupe_id: "balance-correction-tx_B",
					amount: 75000,
				}),
			);
		});

		it("mixed incoming and outgoing transactions handle correctly in parallel", async () => {
			// Simulate one incoming (£500) and one outgoing (£-300) simultaneously
			const deferredPots = createDeferred<{ id: string; balance: number }[]>();
			const deferredWithdraw = createDeferred<void>();
			const operations: string[] = [];

			mockClient.depositIntoPot.mockImplementation(
				async (_potId: string, params: { amount: number }) => {
					operations.push(`deposit:${params.amount}`);
				},
			);

			// getPots returns a deferred promise so we can control when it resolves
			mockClient.getPots.mockImplementation(async () => {
				const pots = await deferredPots.promise;
				return pots;
			});

			mockClient.withdrawFromPot.mockImplementation(
				async (_potId: string, params: { amount: number }) => {
					operations.push(`withdraw:${params.amount}`);
					await deferredWithdraw.promise;
				},
			);

			// Start both operations
			const promiseIncoming = balanceAccount(
				mockClient as any,
				config,
				"tx_incoming",
				50000,
			);
			const promiseOutgoing = balanceAccount(
				mockClient as any,
				config,
				"tx_outgoing",
				-30000,
			);

			// Incoming completes immediately (no deps), outgoing waits on getPots
			// Wait a tick for promises to settle
			await new Promise((resolve) => setImmediate(resolve));

			// Incoming should be done, outgoing should be waiting on getPots
			expect(operations).toContain("deposit:50000");
			expect(operations).toHaveLength(1);

			// Resolve getPots to let outgoing proceed to withdrawal
			deferredPots.resolve([{ id: config.monzo_pot_id, balance: 50000 }]);

			// Wait a tick for withdrawal to be called
			await new Promise((resolve) => setImmediate(resolve));

			// Now withdrawal should be "in flight"
			expect(operations).toContain("withdraw:30000");
			expect(operations).toHaveLength(2);

			// Resolve the withdrawal to complete
			deferredWithdraw.resolve();

			// Wait for both to finish
			await Promise.all([promiseIncoming, promiseOutgoing]);

			// Verify the final state
			expect(operations).toHaveLength(2);
		});
	}); // Close race condition describe
}); // Close main describe
