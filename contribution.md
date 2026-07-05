# Contributing to TwinEdge

First off, thank you for considering contributing to TwinEdge! It's people like you that make TwinEdge such a great platform for edge-native digital twin MRO.

Following these guidelines helps to communicate that you respect the time of the developers managing and developing this open source project. In return, they should reciprocate that respect in addressing your issue, assessing changes, and helping you finalize your pull requests.

## Getting Started

Please refer to the [README.md](README.md) for detailed setup and execution instructions. You will need:
- Docker & Docker Daemon
- Python 3.10+
- Node.js (for the frontend)

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report for TwinEdge. Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.

- **Use a clear and descriptive title** for the issue to identify the problem.
- **Describe the exact steps which reproduce the problem** in as many details as possible.
- **Provide specific examples to demonstrate the steps.** Include links to files or copy/pasteable snippets, which you use in those examples.
- **Describe the behavior you observed after following the steps** and point out what exactly is the problem with that behavior.
- **Explain which behavior you expected to see instead and why.**

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for TwinEdge, including completely new features and minor improvements to existing functionality.

- **Use a clear and descriptive title** for the issue to identify the suggestion.
- **Provide a step-by-step description of the suggested enhancement** in as many details as possible.
- **Provide specific examples to demonstrate the steps.** Include copy/pasteable snippets which you use in those examples, as markdown code blocks.
- **Describe the current behavior** and **explain which behavior you expected to see instead** and why.
- **Explain why this enhancement would be useful** to most TwinEdge users and isn't something that can or should be implemented as a separate application.

### Pull Requests

The process described here has several goals:

- Maintain TwinEdge's quality
- Fix problems that are important to users
- Engage the community in working toward the best possible TwinEdge
- Enable a sustainable system for TwinEdge's maintainers to review contributions

Please follow these steps to have your contribution considered by the maintainers:

1. Fork the repository and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes (`docker run --rm -v $(pwd)/backend:/app twinedge_backend bash -c "pip install pytest httpx && PYTHONPATH=. pytest app/test_main.py"`).
5. Make sure your code lints.
6. Issue that pull request!

## Styleguides

### Git Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

### Python (Backend)

- We follow standard PEP 8 styling.
- Use type hints for all function arguments and return values.
- Make sure to update `requirements.txt` if you add new dependencies.

### React (Frontend)

- We use functional components and React Hooks.
- Ensure any new UI components are responsive.
- Keep the design aesthetic aligned with the current premium look (vibrant colors, glassmorphism, etc.).

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct. Please be welcoming and respectful to all members of our community.
