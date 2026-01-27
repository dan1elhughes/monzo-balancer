import type { FC } from "hono/jsx";
import { AccountWithData } from "../services/account-selection";
import { Layout } from "./styles";

interface AccountSelectionProps {
	accessToken: string;
	refreshToken: string;
	userId: string;
	accounts: AccountWithData[];
}

const AccountOption: FC<{ account: AccountWithData }> = ({ account }) => {
	const balance = (account.balance.balance / 100).toFixed(2);
	return (
		<option value={account.id}>
			{account.description} ({account.type}, £{balance})
		</option>
	);
};

const PotOption: FC<{ pot: any; accountDescription: string }> = ({
	pot,
	accountDescription,
}) => {
	const balance = (pot.balance / 100).toFixed(2);
	return (
		<option value={pot.id}>
			{pot.name} ({accountDescription}, £{balance})
		</option>
	);
};

const AccountSelection: FC<AccountSelectionProps> = (props) => {
	const { accessToken, refreshToken, userId, accounts } = props;

	return (
		<Layout title="Monzo Balancer - Configure">
			<h1>Configure Monzo Balancer</h1>
			<p class="subtitle">Set up your account balancing preferences</p>

			<form action="/setup/finish" method="post">
				<input type="hidden" name="access_token" value={accessToken} />
				<input type="hidden" name="refresh_token" value={refreshToken} />
				<input type="hidden" name="userId" value={userId} />

				<div class="form-group">
					<label for="accountId">Select Account</label>
					<select name="accountId" id="accountId" required>
						<option value="">Choose an account...</option>
						{accounts.map((account) => (
							<AccountOption account={account} />
						))}
					</select>
				</div>

				<div class="form-group">
					<label for="potId">Select Savings Pot</label>
					<select name="potId" id="potId" required>
						<option value="">Choose a pot...</option>
						{accounts.flatMap((account) =>
							account.pots
								.filter((pot) => !pot.deleted)
								.map((pot) => (
									<PotOption
										pot={pot}
										accountDescription={account.description}
									/>
								)),
						)}
					</select>
				</div>

				<div class="form-group">
					<label for="targetBalance">Target Balance</label>
					<div style="display: flex; align-items: center; gap: 0.5rem;">
						<span style="font-size: 1.25rem; color: #007A8B;">£</span>
						<input
							type="number"
							name="targetBalance"
							id="targetBalance"
							required
							min="0"
							step="0.01"
							placeholder="0.00"
							style="flex: 1;"
						/>
					</div>
				</div>

				<div class="form-group">
					<div class="checkbox-group">
						<input type="checkbox" name="dryRun" id="dryRun" value="true" />
						<label for="dryRun">
							<strong>Dry Run Mode</strong>
							<br />
							<span style="font-size: 0.875rem; font-weight: normal;">
								Test without moving money
							</span>
						</label>
					</div>
				</div>

				<button type="submit" class="btn-primary" style="margin-top: 1.5rem;">
					Save Configuration
				</button>
			</form>
		</Layout>
	);
};

export { AccountSelection };
