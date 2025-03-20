# Development Notes

## GitHub Actions

- Updated GitHub Actions workflow to use `npm ci` and enable caching since package-lock.json is now tracked in git
- Previously, package-lock.json was in .gitignore which caused issues with CI

## Project Structure

- Only yarn.lock and pnpm-lock.yaml files are intentionally ignored in git to avoid lock file conflicts
- package-lock.json is now tracked in the repository for CI purposes 