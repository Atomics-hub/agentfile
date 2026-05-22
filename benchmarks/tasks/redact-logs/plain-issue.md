# Redact Auth Logs

Auth log events currently include too much credential material.

Update auth logging so log lines remain valid JSON and keep useful event metadata such as `type` and `userId`, but do not expose raw token values in the serialized log output.

Please update the implementation and run the auth tests and lint before finishing.

