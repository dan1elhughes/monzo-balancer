import { AccountWithData } from "../services/account-selection";
import { Models } from "@otters/monzo";

export function renderAccountSelection(input: {
	accessToken: string;
	refreshToken: string;
	accounts: AccountWithData[];
}): string {
	const { accessToken, refreshToken, accounts } = input;

	// Build accounts HTML
	const accountsHtml = accounts
		.map((acc) => {
			const balance = (acc.balance.balance / 100).toFixed(2);
			return `<option value="${acc.id}">${acc.description} (${acc.type}, £${balance})</option>`;
		})
		.join("");

	// Build pots HTML
	const potsHtml = accounts
		.flatMap((acc) =>
			acc.pots
				.filter((pot) => !pot.deleted)
				.map((pot) => {
					const balance = (pot.balance / 100).toFixed(2);
					return `<option value="${pot.id}">${pot.name} (${acc.description}, £${balance})</option>`;
				}),
		)
		.join("");

	return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Monzo Balancer Setup</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
          .form-group { margin-bottom: 1rem; }
          label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
          select, input { width: 100%; padding: 0.5rem; font-size: 1rem; }
          button { padding: 0.75rem 1.5rem; background: #2D3E50; color: white; border: none; font-size: 1rem; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>Configure Monzo Balancer</h1>
        <form action="/setup/finish" method="POST">
          <input type="hidden" name="access_token" value="${accessToken}" />
          <input type="hidden" name="refresh_token" value="${refreshToken}" />

          <div class="form-group">
            <label for="accountId">Select Account</label>
            <select name="accountId" id="accountId" required>
              ${accountsHtml}
            </select>
          </div>

          <div class="form-group">
            <label for="potId">Select Pot</label>
            <select name="potId" id="potId" required>
              ${potsHtml}
            </select>
          </div>

          <div class="form-group">
            <label for="targetBalance">Target Balance (£)</label>
            <input type="number" name="targetBalance" id="targetBalance" required min="0" step="0.01" placeholder="e.g. 10.00" />
          </div>

          <div class="form-group">
            <label style="font-weight: normal; display: flex; align-items: center; gap: 0.5rem;">
              <input type="checkbox" name="dryRun" id="dryRun" value="true" style="width: auto;" />
              <span>Dry Run Mode (Simulate only - no money moved)</span>
            </label>
          </div>

          <button type="submit">Save Configuration</button>
        </form>
      </body>
    </html>
    `;
}
