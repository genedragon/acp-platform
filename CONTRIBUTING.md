# Contributing to ACP

Thank you for your interest in contributing to the Agentic Collaboration Platform!

## How to Contribute

1. **Fork** the repository
2. **Create a branch** (`git checkout -b feature/your-feature`)
3. **Make your changes** with tests
4. **Open a Pull Request** against `main`

All contributions go through PRs — no direct pushes to `main`.

## What We Need

- **Skills** — New skills for the `skills/` directory
- **Cloud providers** — Azure, GCP deployment templates
- **Documentation** — Deployment guides, tutorials
- **Bug fixes** — See open issues
- **Testing** — Automated tests for `deploy.sh`

## Code Standards

- Shell scripts: `set -euo pipefail`, shellcheck clean
- No secrets in code (see `.gitignore`)
- Document your config with `.example` files

## Security Contributions

For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree your contributions are licensed under Apache 2.0.
