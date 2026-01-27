import type { FC } from "hono/jsx";

interface ApprovalRequiredProps {
	accessToken: string;
	refreshToken: string;
}

const ApprovalRequired: FC<ApprovalRequiredProps> = (props) => {
	const { accessToken, refreshToken } = props;

	return (
		<html>
			<head>
				<meta charset="utf-8" />
			</head>
			<body>
				<h1>Action Required</h1>
				<p>
					Please check your Monzo app to approve access for this application.
				</p>
				<p>Once approved, click the button below.</p>
				<form action="/setup/continue" method="post">
					<input type="hidden" name="access_token" value={accessToken} />
					<input type="hidden" name="refresh_token" value={refreshToken} />
					<button type="submit">I've Approved Access</button>
				</form>
			</body>
		</html>
	);
};

export { ApprovalRequired };
