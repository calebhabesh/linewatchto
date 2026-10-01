# Security Policy

## Supported Versions

Only the current release on the default branch (`main`) is actively maintained and eligible for security fixes.

| Version | Supported |
| --- | --- |
| `main` / latest release | :white_check_mark: |
| Older releases & tags | :x: |

## Reporting a Vulnerability

If you discover a security vulnerability or potential exposure in LineWatchTO, please report it **privately**. Do not open a public GitHub issue, discussion, or pull request.

### Preferred Reporting Route: GitHub Private Vulnerability Reporting

1. Navigate to the LineWatchTO repository on GitHub.
2. Click the **Security** tab.
3. Click **Report a vulnerability** under the Advisories sidebar.
4. Fill in the advisory form with a detailed summary, severity assessment, and reproduction steps.

This routes the report directly to the repository maintainer through GitHub's secure advisory channel without exposing vulnerability details publicly.

### What to Include

To help triage and resolve the issue quickly, please provide:
- A clear description of the vulnerability and its potential impact.
- Affected components (e.g., frontend endpoint, backend controller, auth flow, or Docker configuration).
- Step-by-step instructions, curl commands, or script to reproduce the behavior.
- Any suggested fix or remediation, if available.

### Handling and Disclosure

- **Acknowledgment:** Reports will be acknowledged upon initial review.
- **Triage:** The report will be assessed for real-world impact against the project's security invariants (e.g., server-side credential isolation, rate limiting, and session integrity).
- **Remediation:** Fixes will be prepared and tested in the advisory's temporary private fork. Ordinary branches in the public repository are public.
- **Disclosure:** Once the fix is published on `main` and deployed to production, a public advisory will be issued thanking the reporter if desired.

### Sensitive Data and Credentials

LineWatchTO strictly isolates third-party API keys (such as the Metrolinx developer key) and upstream raw payloads server-side. If you believe a credential, secret token, or administrative endpoint has been inadvertently exposed, report it immediately through the private advisory channel above so revocation and rotation can be initiated.
