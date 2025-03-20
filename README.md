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
import callAI from 'call-ai';

// Basic usage with string prompt
const response = callAI('Explain quantum computing in simple terms', null, {
  apiKey: 'your-api-key',
  model: 'gpt-4'
});

for await (const chunk of response) {
  console.log(chunk); // Streaming updates as they arrive
}

// Using message array for more control
const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Explain quantum computing in simple terms' }
];

const response = callAI(messages, null, {
  apiKey: 'your-api-key',
  model: 'gpt-4'
});

// Non-streaming mode
const result = await callAI('Write a short poem', null, {
  apiKey: 'your-api-key',
  model: 'gpt-4',
  stream: false
}).next();

console.log(result.value);

// Using schema for structured output
const schema = {
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'summary']
};

const response = await callAI('Summarize the benefits of exercise', schema, {
  apiKey: 'your-api-key',
  stream: false
}).next();

const structuredOutput = JSON.parse(response.value);
console.log(structuredOutput.title);
```

## Features

- 🔄 Streaming responses via AsyncGenerator
- 🧩 Structured JSON outputs with schema validation
- 🔌 Compatible with OpenRouter and OpenAI API formats
- 📝 Support for message arrays with system, user, and assistant roles
- 🔧 TypeScript support with full type definitions

## API

```typescript
// Main function
async function* callAI(
  prompt: string | Message[],
  schema: Schema | null = null,
  options: Record<string, any> = {}
): AsyncGenerator<string, string, unknown>

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
```

### Options

* `apiKey`: Your API key (can also be set via window.CALLAI_API_KEY)
* `model`: Model identifier (default: 'openrouter/auto')
* `endpoint`: API endpoint (default: OpenRouter endpoint)
* `stream`: Enable streaming responses (default: true)
* Any other options are passed directly to the API (temperature, etc.)

## License

MIT or Apache-2.0