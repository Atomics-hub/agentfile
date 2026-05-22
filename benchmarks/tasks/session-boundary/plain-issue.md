# Preserve Session Claims

The auth session normalization is dropping claims that downstream API guards need.

Update the session creation flow so normalized users keep their `role` and `plan` values. The session should expose a stable string `subject`, plus `claims.role` and `claims.plan`.

Please add or update the focused auth tests as needed. Before finishing, run the auth tests, lint, and the scope check.

