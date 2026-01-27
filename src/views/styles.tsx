/**
 * Monzo Brand Colors
 * https://www.brandcolorcode.com/monzo
 */
export const colors = {
	blueGreen: "#007A8B", // Primary brand color
	green: "#4BB78F",
	orange: "#F1BD76",
	red: "#FE4B60",
	darkBlue: "#001E3A",
	white: "#FFFFFF",
	lightGray: "#F8F9FA",
	mediumGray: "#E9ECEF",
	darkGray: "#495057",
	textDark: "#212529",
};

/**
 * Global stylesheet for the application
 */
export const GlobalStyles = () => (
	<style>{`
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		html, body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
				'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
				sans-serif;
			-webkit-font-smoothing: antialiased;
			-moz-osx-font-smoothing: grayscale;
			background-color: ${colors.lightGray};
			color: ${colors.textDark};
		}

		body {
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 1rem;
		}

		main {
			width: 100%;
			max-width: 600px;
			background: ${colors.white};
			border-radius: 12px;
			padding: 2rem;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		}

		h1 {
			font-size: 1.875rem;
			font-weight: 600;
			margin-bottom: 0.5rem;
			color: ${colors.darkBlue};
		}

		h1:first-child {
			margin-top: 0;
		}

		p {
			font-size: 1rem;
			line-height: 1.5;
			margin-bottom: 1rem;
			color: ${colors.darkGray};
		}

		p:last-child {
			margin-bottom: 0;
		}

		.subtitle {
			font-size: 0.875rem;
			color: ${colors.darkGray};
			margin-bottom: 2rem;
			margin-top: -0.5rem;
		}

		.form-group {
			margin-bottom: 1.5rem;
		}

		.form-group:last-child {
			margin-bottom: 0;
		}

		label {
			display: block;
			margin-bottom: 0.75rem;
			font-weight: 500;
			font-size: 0.95rem;
			color: ${colors.textDark};
		}

		select,
		input[type="number"],
		input[type="text"],
		input[type="email"] {
			width: 100%;
			padding: 0.75rem;
			font-size: 1rem;
			border: 2px solid ${colors.mediumGray};
			border-radius: 8px;
			font-family: inherit;
			transition: all 0.2s ease;
			background-color: ${colors.white};
			color: ${colors.textDark};
		}

		select:hover,
		input[type="number"]:hover,
		input[type="text"]:hover,
		input[type="email"]:hover {
			border-color: ${colors.blueGreen};
		}

		select:focus,
		input[type="number"]:focus,
		input[type="text"]:focus,
		input[type="email"]:focus {
			outline: none;
			border-color: ${colors.blueGreen};
			box-shadow: 0 0 0 3px rgba(0, 122, 139, 0.1);
		}

		button {
			width: 100%;
			padding: 0.875rem;
			font-size: 1rem;
			font-weight: 600;
			border: none;
			border-radius: 8px;
			cursor: pointer;
			transition: all 0.2s ease;
			font-family: inherit;
		}

		.btn-primary {
			background-color: ${colors.blueGreen};
			color: ${colors.white};
		}

		.btn-primary:hover {
			background-color: ${colors.darkBlue};
			transform: translateY(-1px);
			box-shadow: 0 4px 12px rgba(0, 122, 139, 0.3);
		}

		.btn-primary:active {
			transform: translateY(0);
			box-shadow: 0 2px 6px rgba(0, 122, 139, 0.2);
		}

		.checkbox-group {
			display: flex;
			align-items: center;
			gap: 0.75rem;
		}

		.checkbox-group label {
			margin: 0;
			font-weight: 400;
		}

		input[type="checkbox"] {
			width: 1.25rem;
			height: 1.25rem;
			cursor: pointer;
			accent-color: ${colors.blueGreen};
		}

		.success-message {
			background-color: ${colors.green};
			color: ${colors.white};
			padding: 1rem;
			border-radius: 8px;
			margin-bottom: 1rem;
		}

		.info-box {
			background-color: #E3F2FD;
			border-left: 4px solid ${colors.blueGreen};
			padding: 1rem;
			border-radius: 4px;
			margin-bottom: 1.5rem;
		}

		.info-box p {
			margin: 0;
			color: ${colors.darkBlue};
		}

		footer {
			margin-top: 2rem;
			text-align: center;
			font-size: 0.875rem;
			color: ${colors.darkGray};
			border-top: 1px solid ${colors.mediumGray};
			padding-top: 1rem;
		}
	`}</style>
);

/**
 * Layout component wrapping content
 */
export const Layout = (props: { children: any; title?: string }) => (
	<html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<title>{props.title || "Monzo Balancer"}</title>
			<GlobalStyles />
		</head>
		<body>
			<main>{props.children}</main>
		</body>
	</html>
);
