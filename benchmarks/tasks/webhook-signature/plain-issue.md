# Verify Webhook Signatures

Webhook signature verification is too brittle.

Update webhook signature verification so valid signed webhook bodies are accepted and tampered webhook bodies are rejected. The implementation should continue to accept the existing compact JSON payloads used by the webhook tests.

Please update the implementation and run the webhook tests and lint before finishing.
