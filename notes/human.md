# Development Notes

## GitHub Actions

- Fixed GitHub Actions workflow (2023-07-06) to use `npm install` instead of `npm ci` since package-lock.json is in .gitignore
- Remove npm cache since lock files are not in the repository

## Project Structure

- The package-lock.json, yarn.lock, and pnpm-lock.yaml files are intentionally ignored in git (see .gitignore) 