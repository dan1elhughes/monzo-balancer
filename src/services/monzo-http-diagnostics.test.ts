import { describe, expect, it } from "vitest";
import { getMonzoHttpDiagnostics } from "./monzo-http-diagnostics";

describe("getMonzoHttpDiagnostics", () => {
	it("extracts bounded response details without leaking request secrets", async () => {
		const request = new Request(
			"https://api.monzo.com/transactions/tx_test?secret=query-value",
			{
				method: "GET",
				headers: { Authorization: "Bearer secret-token" },
			},
		);
		const response = new Response('{"error":"invalid_token"}', {
			status: 403,
		});

		const diagnostics = await getMonzoHttpDiagnostics({ request, response });

		expect(diagnostics).toEqual({
			status: 403,
			method: "GET",
			pathname: "/transactions/tx_test",
			responseBody: '{"error":"invalid_token"}',
			responseBodyTruncated: false,
		});
		expect(JSON.stringify(diagnostics)).not.toContain("query-value");
		expect(JSON.stringify(diagnostics)).not.toContain("secret-token");
	});

	it("truncates response bodies longer than 2,000 characters", async () => {
		const body = "x".repeat(2001);
		const request = new Request("https://api.monzo.com/transactions/tx_test");
		const response = new Response(body, { status: 403 });

		const diagnostics = await getMonzoHttpDiagnostics({ request, response });

		expect(diagnostics?.responseBody).toBe("x".repeat(2000));
		expect(diagnostics?.responseBodyTruncated).toBe(true);
	});

	it("returns null for errors without HTTP request and response details", async () => {
		expect(
			await getMonzoHttpDiagnostics(new Error("ordinary failure")),
		).toBeNull();
	});

	it("preserves HTTP metadata when the response body cannot be read", async () => {
		const request = new Request("https://api.monzo.com/transactions/tx_test", {
			method: "GET",
		});
		const response = {
			status: 403,
			clone: () => {
				throw new Error("body unavailable");
			},
		};

		const diagnostics = await getMonzoHttpDiagnostics({ request, response });

		expect(diagnostics).toEqual({
			status: 403,
			method: "GET",
			pathname: "/transactions/tx_test",
			responseBody: "[unavailable]",
			responseBodyTruncated: false,
		});
	});

	it("returns null instead of throwing when the request URL is malformed", async () => {
		const request = { method: "GET", url: "not a URL" };
		const response = new Response('{"error":"invalid_token"}', {
			status: 403,
		});

		expect(await getMonzoHttpDiagnostics({ request, response })).toBeNull();
	});
});
