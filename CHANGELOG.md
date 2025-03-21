# Changelog

## 0.2.1 (2024-06-17)

### Improvements
- Enhanced schema handling to better support JSON schema definition
- Added test coverage for complex schema use cases
- Updated documentation with comprehensive examples for structured responses
- Added aliens schema example to show more complex schema usage

## 0.2.0 (2024-06-16)

### Breaking Changes
- Simplified API by moving `schema` parameter into the options object
- Changed streaming to be explicitly opt-in (default is non-streaming)
- Updated return type to be `Promise<string>` for non-streaming and `AsyncGenerator` for streaming
- Removed need for `null` parameter when not using schema

### Improvements
- Improved TypeScript types and documentation
- Reduced code duplication by extracting common request preparation logic
- Enhanced error handling for both streaming and non-streaming modes
- Updated documentation in both README and llms.txt
- Better developer experience with a cleaner API signature

## 0.1.5 (2024-03-20)

- Initial release
- Support for streaming responses
- JSON schema for structured output
- Compatible with OpenRouter and OpenAI API 