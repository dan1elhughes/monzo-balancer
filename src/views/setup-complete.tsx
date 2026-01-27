import type { FC } from "hono/jsx";
import { Layout, colors } from "./styles";

const SetupComplete: FC = () => {
	return (
		<Layout title="Monzo Balancer - Setup Complete">
			<div style={`text-align: center; padding: 1rem 0;`}>
				<div
					style={`
            font-size: 3rem;
            margin-bottom: 1rem;
            color: ${colors.green};
          `}
				>
					✓
				</div>
				<h1 style={`color: ${colors.green}; margin-bottom: 0.5rem;`}>
					Setup Complete!
				</h1>
				<p class="subtitle">
					Your Monzo Balancer is now active and monitoring your account
				</p>
			</div>

			<div class="info-box">
				<p>
					<strong>What happens next:</strong>
					<br />
					Your account will be automatically balanced whenever a transaction is
					detected. If your main account balance exceeds your target, excess
					funds will be deposited into your pot. If it falls below your target,
					funds will be withdrawn from your pot.
				</p>
			</div>

			<p style={`color: ${colors.darkGray}; font-size: 0.875rem;`}>
				You can update your settings at any time by logging back in to this
				application.
			</p>

			<footer>
				<p>Monzo Balancer • Automatic Account Balancing</p>
			</footer>
		</Layout>
	);
};

export { SetupComplete };
