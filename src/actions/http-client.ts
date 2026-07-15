/**
 * Shared HTTP helpers extracted from BaseAction.
 * Encoder actions compose with these instead of inheriting BaseAction's
 * 300+ lines of canvas rendering code.
 */

/**
 * Resolve the port from global settings, per-action settings, or default.
 * Priority: globalSettings.port > settings.port > "26538"
 */
export function getPort(
	settings: { port?: string },
	globalSettings: { port?: string }
): string {
	return globalSettings.port || settings.port || "26538";
}

/**
 * Build the base URL for the pear-desktop API using the resolved port.
 */
export function getBaseUrl(port: string): string {
	return `http://localhost:${port}/api/v1`;
}

/**
 * Low-level fetch wrapper with JSON headers and error logging.
 */
export async function httpRequest(
	port: string,
	endpoint: string,
	options: RequestInit = {}
): Promise<Response> {
	const url = `${getBaseUrl(port)}${endpoint}`;
	const defaultHeaders: Record<string, string> = {
		"Content-Type": "application/json"
	};

	const headers = { ...defaultHeaders };
	if (options.headers) {
		Object.assign(headers, options.headers);
	}

	try {
		const response = await fetch(url, {
			...options,
			headers
		});

		if (!response.ok) {
			console.warn(
				`[http-client] Request to ${endpoint} failed: ${response.status} ${response.statusText}`
			);
		}
		return response;
	} catch (error) {
		console.error(`[http-client] Request error (${endpoint}):`, error);
		throw error;
	}
}

/**
 * Perform a GET request. Returns parsed JSON on success, null on failure.
 */
export async function httpGet<T = unknown>(
	port: string,
	endpoint: string
): Promise<T | null> {
	const response = await httpRequest(port, endpoint, { method: "GET" });
	if (response.ok) {
		return response.json() as Promise<T>;
	}
	return null;
}

/**
 * Perform a POST request. Returns the raw Response for status inspection.
 */
export async function httpPost(
	port: string,
	endpoint: string,
	body?: unknown
): Promise<Response> {
	return httpRequest(port, endpoint, {
		method: "POST",
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
}

/**
 * Perform a PATCH request. Returns the raw Response.
 */
export async function httpPatch(
	port: string,
	endpoint: string,
	body?: unknown
): Promise<Response> {
	return httpRequest(port, endpoint, {
		method: "PATCH",
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
}

/**
 * Perform a DELETE request. Returns the raw Response.
 */
export async function httpDelete(
	port: string,
	endpoint: string,
	body?: unknown
): Promise<Response> {
	return httpRequest(port, endpoint, {
		method: "DELETE",
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
}
