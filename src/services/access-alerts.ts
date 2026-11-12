import { EmailMessage } from "cloudflare:email";
import { Env } from "../types";
import { logger } from "../logger";

export type AccessCheckName =
	| "authentication"
	| "transactions"
	| "deposits"
	| "withdrawals"
	| "pots"
	| "token_refresh";

export interface AccessCheck {
	accountId: string;
	check: AccessCheckName;
	status: "healthy" | "unhealthy" | "untested";
	detail: string;
}

interface ClaimedCheck {
	status: "healthy" | "unhealthy";
	detail: string;
	checked_at: number;
}

export async function recordAccessCheck(
	env: Env,
	result: AccessCheck,
): Promise<void> {
	try {
		const now = Date.now();
		await env.DB.prepare(
			`
			INSERT INTO access_checks (account_id, check_name, status, detail, checked_at,
				pending_status, pending_detail, pending_checked_at)
			VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 'unhealthy' THEN 'unhealthy' END, ?, ?)
			ON CONFLICT(account_id, check_name) DO UPDATE SET
				status=excluded.status, detail=excluded.detail, checked_at=excluded.checked_at,
				pending_status=COALESCE(access_checks.pending_status,
					CASE WHEN excluded.status != 'untested' AND excluded.status != access_checks.notified_status THEN excluded.status END),
				pending_detail=CASE WHEN access_checks.pending_status IS NULL THEN excluded.detail ELSE access_checks.pending_detail END,
				pending_checked_at=CASE WHEN access_checks.pending_status IS NULL THEN excluded.checked_at ELSE access_checks.pending_checked_at END
		`,
		)
			.bind(
				result.accountId,
				result.check,
				result.status,
				result.detail,
				now,
				result.status,
				result.detail,
				now,
			)
			.run();
		await notifyAccessCheck(env, result);
	} catch {
		logger.error("Could not record Monzo access check", {
			accountId: result.accountId,
			check: result.check,
		});
	}
}

export async function flushPendingAccessAlerts(env: Env): Promise<void> {
	try {
		const pending = await env.DB.prepare(
			`SELECT account_id, check_name FROM access_checks
			WHERE pending_status IS NOT NULL`,
		).all<{ account_id: string; check_name: AccessCheckName }>();
		for (const row of pending.results) {
			await notifyAccessCheck(env, {
				accountId: row.account_id,
				check: row.check_name,
			});
		}
	} catch {
		logger.error("Could not retry pending Monzo notifications");
	}
}

async function notifyAccessCheck(
	env: Env,
	result: Pick<AccessCheck, "accountId" | "check">,
): Promise<void> {
	try {
		const now = Date.now();
		const claimId = crypto.randomUUID();
		const claimed = await env.DB.prepare(
			`
			UPDATE access_checks SET claim_id=?, claim_until=?
			WHERE account_id=? AND check_name=? AND pending_status IS NOT NULL
				AND (claim_id IS NULL OR claim_until <= ?)
			RETURNING pending_status AS status, pending_detail AS detail, pending_checked_at AS checked_at
		`,
		)
			.bind(claimId, now + 5 * 60 * 1000, result.accountId, result.check, now)
			.first<ClaimedCheck>();
		if (!claimed) return;

		try {
			if (!env.ALERT_EMAIL || !env.ALERT_FROM || !env.ALERT_TO) {
				throw new Error("Email alerts are not configured");
			}
			const outcome = claimed.status === "healthy" ? "recovered" : "failed";
			const body = [
				`Monzo Balancer: ${result.check} ${outcome}`,
				`Account: ${result.accountId}`,
				`Checked at: ${new Date(claimed.checked_at).toISOString()}`,
				claimed.detail,
				"",
				claimed.status === "unhealthy"
					? "Automatic balancing may be unavailable. Check Monzo app approval and reconnect through the Balancer setup page if required."
					: "This check now passes. Pot transfers were not tested by the read-only checks.",
				"No balance correction was attempted by this check. Missed transactions are not replayed automatically.",
			].join("\r\n");
			const raw = [
				`From: Monzo Balancer <${env.ALERT_FROM}>`,
				`To: ${env.ALERT_TO}`,
				`Subject: Monzo Balancer: ${result.check} ${outcome}`,
				"MIME-Version: 1.0",
				"Content-Type: text/plain; charset=utf-8",
				"",
				body,
				"",
			].join("\r\n");
			await env.ALERT_EMAIL.send(
				new EmailMessage(env.ALERT_FROM, env.ALERT_TO, raw),
			);
			await env.DB.prepare(
				`
				UPDATE access_checks SET notified_status=?, claim_id=NULL, claim_until=NULL,
					pending_status=CASE WHEN status != 'untested' AND status != ? THEN status END,
					pending_detail=detail, pending_checked_at=checked_at
				WHERE account_id=? AND check_name=? AND claim_id=?
			`,
			)
				.bind(
					claimed.status,
					claimed.status,
					result.accountId,
					result.check,
					claimId,
				)
				.run();
			logger.info("Monzo access notification sent", {
				accountId: result.accountId,
				check: result.check,
				status: claimed.status,
			});
		} catch {
			await env.DB.prepare(
				`
				UPDATE access_checks SET claim_id=NULL, claim_until=NULL
				WHERE account_id=? AND check_name=? AND claim_id=?
			`,
			)
				.bind(result.accountId, result.check, claimId)
				.run();
			logger.error("Monzo access notification failed", {
				accountId: result.accountId,
				check: result.check,
			});
		}
	} catch {
		logger.error("Could not record Monzo access check", {
			accountId: result.accountId,
			check: result.check,
		});
	}
}
