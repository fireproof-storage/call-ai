# Release Process for call-ai

This document outlines the steps to create a new release of the call-ai package.

## Preparation

1. Complete the development work and have it merged to the main branch
2. Ensure all tests pass locally with `npm test`
3. Run type checking with `npm run typecheck` to verify no type errors
4. Update the CHANGELOG.md with the new version and changes

## Release Steps

1. Update version in package.json:

   ```bash
   npm version patch|minor|major
   ```

   - Use `patch` for bug fixes (0.x.Y)
   - Use `minor` for new features (0.X.0)
   - Use `major` for breaking changes (X.0.0)

2. This will:
   - Update the version in package.json
   - Create a new git commit
   - Create a new git tag

3. Push the changes and the tag:

   ```bash
   git push && git push --tags
   ```

4. The GitHub Actions workflow (.github/workflows/publish.yml) will:
   - Run tests and type checking
   - Verify the tag signature
   - Publish the package to npm

## Monitoring

1. Check the GitHub Actions tab to ensure the workflow completes successfully
2. Verify the package appears on npm with the new version
3. Update any dependent projects to use the new version

## Troubleshooting

If the CI process fails:

1. Check the GitHub Actions logs for details
2. Make necessary fixes
3. Delete the failed tag locally and remotely:
   ```bash
   git tag -d v0.x.y
   git push --delete origin v0.x.y
   ```
4. Start the process again once the issues are fixed
