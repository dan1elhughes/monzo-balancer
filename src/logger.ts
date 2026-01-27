export const logger = {
	info: (message: string, data?: Record<string, unknown>) => {
		console.log(JSON.stringify({ level: "info", message, ...data }));
	},
	warn: (message: string, data?: Record<string, unknown>) => {
		console.warn(JSON.stringify({ level: "warn", message, ...data }));
	},
	error: (message: string, error?: unknown) => {
		const errorData =
			error instanceof Error
				? { message: error.message, stack: error.stack, name: error.name }
				: error;
		console.error(
			JSON.stringify({ level: "error", message, error: errorData }),
		);
	},
};
