# call-ai

A lightweight library for making AI API calls with streaming support.

## Installation

```bash
npm install call-ai
# or
yarn add call-ai
# or
pnpm add call-ai
```

## Usage

```typescript
import { callAI } from 'call-ai';

// Basic usage with string prompt (non-streaming by default)
const response = await callAI('Explain quantum computing in simple terms', {
  apiKey: 'your-api-key',
  model: 'gpt-4'
});

// The response is the complete text
console.log(response);

// With streaming enabled (returns an AsyncGenerator)
const generator = callAI('Tell me a story', {
  apiKey: 'your-api-key',
  model: 'gpt-4',
  stream: true
});

// Process streaming updates
for await (const chunk of generator) {
  console.log(chunk); // Streaming updates as they arrive
}

// Using message array for more control
const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Explain quantum computing in simple terms' }
];

const response = await callAI(messages, {
  apiKey: 'your-api-key',
  model: 'gpt-4'
});

console.log(response);

// Using schema for structured output
const schema = {
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'summary']
};

const response = await callAI('Summarize the benefits of exercise', {
  apiKey: 'your-api-key',
  schema: schema
});

const structuredOutput = JSON.parse(response);
console.log(structuredOutput.title);

// Streaming with schema for OpenRouter structured JSON output
const schema = {
  properties: {
    title: { type: 'string' },
    items: { 
      type: 'array', 
      items: { 
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' }
        }
      } 
    }
  }
};

const generator = callAI('Create a list of sci-fi books', {
  apiKey: 'your-api-key',
  stream: true,
  schema: schema
});

for await (const chunk of generator) {
  console.log(chunk); // Shows the partial JSON as it's being generated
}
```

## Features

- 🔄 Streaming responses via AsyncGenerator when `stream: true`
- 🧩 Structured JSON outputs with schema validation
- 🔌 Full compatibility with OpenRouter's JSON schema format for structured outputs
- 📝 Support for message arrays with system, user, and assistant roles
- 🔧 TypeScript support with full type definitions
- ✅ Works in Node.js and browser environments

## Supported LLM Providers

By default, call-ai uses the OpenRouter API which provides access to multiple LLM models. You can also configure it to use other providers with OpenAI-compatible APIs:

- [OpenRouter](https://openrouter.ai/) (default)
- [OpenAI](https://openai.com/)
- [Anthropic Claude](https://www.anthropic.com/) (via OpenRouter)
- [Mistral](https://mistral.ai/) (via OpenRouter)
- Any API with OpenAI-compatible endpoints

See [llms.txt](./llms.txt) for a full list of compatible models.

## Setting API Keys

You can provide your API key in three ways:

1. Directly in the options:
```typescript
const response = await callAI('Hello', { apiKey: 'your-api-key' });
```

2. Set globally in the browser:
```typescript
window.CALLAI_API_KEY = 'your-api-key';
const response = await callAI('Hello');
```

3. Use environment variables in Node.js (with a custom implementation):
```typescript
// Example of environment variable integration
import { callAI } from 'call-ai';
const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
const response = await callAI('Hello', { apiKey });
```

## API

```typescript
// Main function
function callAI(
  prompt: string | Message[],
  options?: CallAIOptions
): Promise<string> | AsyncGenerator<string, string, unknown>

// Types
type Message = {
  role: 'user' | 'system' | 'assistant';
  content: string;
};

interface Schema {
  name?: string;
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

interface CallAIOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  stream?: boolean;
  schema?: Schema | null;
  [key: string]: any;
}
```

### Options

* `apiKey`: Your API key (can also be set via window.CALLAI_API_KEY)
* `model`: Model identifier (default: 'openrouter/auto')
* `endpoint`: API endpoint (default: 'https://openrouter.ai/api/v1/chat/completions')
* `stream`: Enable streaming responses (default: false)
* `schema`: Optional JSON schema for structured output
* Any other options are passed directly to the API (temperature, max_tokens, etc.)

## License

MIT or Apache-2.0, at your option

## Contributing and Release Process

### Development

1. Fork the repository
2. Make your changes
3. Add tests for new functionality
4. Run tests: `npm test`
5. Run type checking: `npm run typecheck`
6. Create a pull request

### Release Process

This library uses GitHub Actions to automate the release process:

1. Update the version in `package.json` (follow semver)
2. Update `CHANGELOG.md` with details of changes
3. Commit changes: `git commit -am "Release vX.Y.Z"`
4. Create a git tag: `git tag -a vX.Y.Z -m "Version X.Y.Z"`
5. Push changes and tag: `git push origin main vX.Y.Z`

The GitHub workflow in `.github/workflows/publish.yml` will:
- Automatically trigger when a new tag is pushed
- Run tests and type checking
- Verify the tag signature
- Publish the package to npm

When making significant changes, remember to:
- Document breaking changes in the changelog
- Update documentation to reflect API changes
- Update TypeScript types