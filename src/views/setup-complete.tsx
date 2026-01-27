import type { FC } from "hono/jsx";

const SetupComplete: FC = () => {
	return (
		<html>
			<head>
				<meta charset="utf-8" />
				<title>Setup Complete</title>
			</head>
			<body>
				<h1>Account setup complete!</h1>
				<p>Your Monzo Balancer has been configured successfully.</p>
			</body>
		</html>
	);
};

export { SetupComplete };
