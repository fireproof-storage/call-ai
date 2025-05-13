# Refactoring Notes for call-ai

## Strategy pattern implementation

Based on model-chooser-new.md, I'm refactoring the codebase to use a cleaner strategy pattern for handling different model types and their schema approaches.

### Initial findings:

1. Current implementation uses multiple conditional checks and flags
2. Duplicated model detection logic in different functions
3. Multiple code paths for handling similar functionality
4. Complex conditionals that are hard to maintain

### Implementation plan:

1. Create a `ModelStrategy` interface and implementations for each strategy
2. Implement a `chooseSchemaStrategy` function to select the appropriate strategy
3. Consolidate response processing logic
4. Handle special cases like Claude's streaming mode more elegantly
5. Remove duplicated code for tool extraction

### Completed changes:

1. Created a `ModelStrategy` interface to define how each model family handles structured output:
   - `prepareRequest`: Modifies the request with appropriate schema formatting
   - `processResponse`: Handles parsing/extracting JSON from responses

2. Implemented concrete strategies for different model families:
   - `openAIStrategy`: For OpenAI models using native JSON schema
   - `geminiStrategy`: For Google Gemini models using JSON schema
   - `claudeStrategy`: For Anthropic Claude models using tool mode
   - `systemMessageStrategy`: For other models using system message with schema instructions
   - `defaultStrategy`: Fallback for models without schema

3. Created a `chooseSchemaStrategy` function to select the appropriate strategy based on model name

4. Refactored `prepareRequestParams` to use the strategy pattern:
   - Eliminated multiple model detection flags
   - Consolidated duplicated schema processing code
   - Made code more maintainable with clear separation of concerns

5. Refactored `processResponseContent` to use the strategy pattern:
   - Eliminated duplicated JSON extraction logic
   - Delegated response processing to the appropriate strategy

6. Updated `callAi` to properly handle forced streaming for Claude:
   - Added `bufferStreamingResults` function for cases where we need streaming internally but the caller requested non-streaming
   - Preserved the API contract while improving reliability

7. Updated `callAINonStreaming` and `callAIStreaming` to use the strategy pattern:
   - Consolidated tool use extraction logic
   - Made the code more maintainable

### Benefits of the refactoring:

1. **Cleaner code**: Removed duplicated logic and complex conditionals
2. **Better maintainability**: Each model family's behavior is encapsulated in its own strategy
3. **Easier to extend**: Adding support for new models simply requires categorizing them or adding a new strategy
4. **Improved reliability**: Special cases like Claude's streaming requirements are handled transparently
5. **Preserved API contract**: All changes are internal, with no changes to the public API

### Remaining tasks:

1. Consider removing the now-deprecated `processResponseContent` function if not used elsewhere
2. Add more comprehensive error handling
3. Add tests for the new strategy-based implementation
4. Update documentation to reflect the internal architecture changes
