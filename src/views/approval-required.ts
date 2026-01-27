export function renderApprovalRequired(
	accessToken: string,
	refreshToken: string,
): string {
	return `
      <html>
        <body>
          <h1>Action Required</h1>
          <p>Please check your Monzo app to approve access for this application.</p>
          <p>Once approved, click the button below.</p>
          <form action="/setup/continue" method="POST">
            <input type="hidden" name="access_token" value="${accessToken}" />
            <input type="hidden" name="refresh_token" value="${refreshToken}" />
            <button type="submit">I've Approved Access</button>
          </form>
        </body>
      </html>
      `;
}
