import { logger } from "../logger";

export async function getExistingWebhooks(
	accountId: string,
	accessToken: string,
): Promise<{ id: string; url: string; account_id: string }[]> {
	const response = await fetch(
		`https://api.monzo.com/webhooks?account_id=${accountId}`,
		{
			headers: { Authorization: `Bearer ${accessToken}` },
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch webhooks: ${response.statusText}`);
	}

	const { webhooks } = (await response.json()) as {
		webhooks: { id: string; url: string; account_id: string }[];
	};

	return webhooks;
}

export async function registerWebhookIfNeeded(
	accountId: string,
	webhookUrl: string,
	accessToken: string,
): Promise<void> {
	try {
		const existingWebhooks = await getExistingWebhooks(accountId, accessToken);
		const webhookExists = existingWebhooks.some((w) => w.url === webhookUrl);

		if (!webhookExists) {
			logger.info("Registering new webhook...");
			const response = await fetch("https://api.monzo.com/webhooks", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Authorization: `Bearer ${accessToken}`,
				},
				body: new URLSearchParams({ account_id: accountId, url: webhookUrl }),
			});

			if (!response.ok) {
				throw new Error(`Failed to register webhook: ${response.statusText}`);
			}
		} else {
			logger.info("Webhook already registered");
		}
	} catch (e) {
		logger.error("Failed to register webhook", e);
		// Continue anyway, we can try again later or it might exist
	}
}
