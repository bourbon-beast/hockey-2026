## 2026-04-02 - Hardcoded Turso Credentials in Utility Script
**Vulnerability:** A local utility script (`check-rounds.mjs`) contained hardcoded credentials (`libsql://...` URL and a JWT authentication token) for a Turso database.
**Learning:** Even utility or ad-hoc scripts placed in version control can expose critical cloud infrastructure if they contain hardcoded secrets. It's easy to overlook security best practices when writing "quick" scripts meant for local testing or validation.
**Prevention:** Always use environment variables (e.g., `process.env.TURSO_URL`, `process.env.TURSO_TOKEN`) for database credentials and API keys in scripts. Implement checks that exit early with clear error messages if the required variables are missing to enforce secure usage patterns.
