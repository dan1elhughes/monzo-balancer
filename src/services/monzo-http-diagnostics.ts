const MAX_RESPONSE_BODY_LENGTH = 2000;

export interface MonzoHttpDiagnostics {
	status: number;
	method: string;
	pathname: string;
	responseBody: string;
	responseBodyTruncated: boolean;
}

interface RequestDetails {
	method: string;
	url: string;
}

interface ResponseDetails {
	status: number;
	clone: () => { text: () => Promise<string> };
}

function hasHttpDetails(
	error: unknown,
): error is { request: RequestDetails; response: ResponseDetails } {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	const { request, response } = error as {
		request?: unknown;
		response?: unknown;
	};

	return (
		typeof request === "object" &&
		request !== null &&
		typeof (request as RequestDetails).method === "string" &&
		typeof (request as RequestDetails).url === "string" &&
		typeof response === "object" &&
		response !== null &&
		typeof (response as ResponseDetails).status === "number" &&
		typeof (response as ResponseDetails).clone === "function"
	);
}

export async function getMonzoHttpDiagnostics(
	error: unknown,
): Promise<MonzoHttpDiagnostics | null> {
	if (!hasHttpDetails(error)) {
		return null;
	}

	let pathname: string;
	try {
		pathname = new URL(error.request.url).pathname;
	} catch {
		return null;
	}

	let responseBody = "[unavailable]";
	let responseBodyTruncated = false;

	try {
		const fullResponseBody = await error.response.clone().text();
		responseBody = fullResponseBody.slice(0, MAX_RESPONSE_BODY_LENGTH);
		responseBodyTruncated = fullResponseBody.length > MAX_RESPONSE_BODY_LENGTH;
	} catch {
		// Keep the HTTP metadata even when the response body cannot be inspected.
	}

	return {
		status: error.response.status,
		method: error.request.method,
		pathname,
		responseBody,
		responseBodyTruncated,
	};
}
