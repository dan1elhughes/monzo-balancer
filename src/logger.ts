export const logger = {
	info: (message: string, data?: Record<string, any>) => {
		console.log(JSON.stringify({ level: "info", message, ...data }));
	},
	warn: (message: string, data?: Record<string, any>) => {
		console.warn(JSON.stringify({ level: "warn", message, ...data }));
	},
	error: (message: string, error?: any) => {
		const errorData =
			error instanceof Error
				? { message: error.message, stack: error.stack, name: error.name }
				: error;
		console.error(
			JSON.stringify({ level: "error", message, error: errorData }),
		);
	},
};
