# Fix Login Refresh Race

Several API calls can receive 401 responses at the same time and trigger duplicate refresh requests.

Update the auth refresh flow so concurrent refresh attempts share one in-flight refresh operation instead of each making a separate upstream token request.

Please include a regression test showing concurrent refresh calls result in exactly one upstream request, and make sure failed refreshes clear the in-flight operation.

Before finishing, run the relevant auth tests and lint checks, then summarize what changed and any remaining race assumptions.

