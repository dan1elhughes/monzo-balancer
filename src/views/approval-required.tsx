import type { FC } from "hono/jsx";
import { Layout } from "./styles";

interface ApprovalRequiredProps {
	accessToken: string;
	refreshToken: string;
	userId: string;
}

const ApprovalRequired: FC<ApprovalRequiredProps> = (props) => {
	const { accessToken, refreshToken, userId } = props;

	return (
		<Layout title="Monzo Balancer - Action Required">
			<h1>Action Required</h1>
			<p class="subtitle">We need your approval to access your Monzo account</p>

			<div class="info-box">
				<p>
					Open your Monzo app on your phone and approve the access request for
					Monzo Balancer.
				</p>
			</div>

			<p>Once you've approved access, click the button below to continue.</p>

			<form action="/setup/continue" method="post" style="margin-top: 1.5rem;">
				<input type="hidden" name="access_token" value={accessToken} />
				<input type="hidden" name="refresh_token" value={refreshToken} />
				<input type="hidden" name="userId" value={userId} />
				<button type="submit" class="btn-primary">
					I've Approved Access
				</button>
			</form>
		</Layout>
	);
};

export { ApprovalRequired };
