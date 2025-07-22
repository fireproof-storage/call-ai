# Changes Summary: Current HEAD vs dc3f088

## Files Changed

- `.env.example` (New file): Added template for API keys
- `README.md`: Added integration test documentation
- `jest.config.js`: Updated test matching patterns
- `package.json`: Version bump to 0.4.1 and added integration test script
- `src/index.ts`: Enhanced model selection and Claude support
- `test/fetch.integration.test.ts` (New file): Added OpenRouter API integration tests
- `test/integration.test.ts` (New file): Additional integration tests
- `src/index.test.ts` → `test/unit.test.ts`: Moved and updated unit tests

## Major Changes

### Enhanced Model Support

- Added explicit support for Claude models with special handling for structured output
- Improved model selection logic with better defaults based on schema requirements
- Added detection for Claude models to adjust output formatting

### Integration Tests

- Added comprehensive integration test suite that makes real API calls
- Created separate test scripts to avoid running API calls during CI/CD
- Added tests for different model providers (OpenAI, Claude, Gemini)
- Added structured output validation for various schema formats

### Environment Configuration

- Added `.env.example` with template for API keys
- Added dotenv dependency for loading environment variables
- Support for both OPENROUTER_API_KEY and CALLAI_API_KEY

### Code Organization

- Moved tests to dedicated test directory
- Separated unit tests from integration tests
- Added test patterns to exclude integration tests from regular test runs

### API Updates

- Version bump to 0.4.1
- Updated license information
- Enhanced schema handling for better compatibility with different providers
