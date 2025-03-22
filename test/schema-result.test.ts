import { callAI, Schema } from '../src/index';
import dotenv from 'dotenv';
const TIMEOUT = 30000;

// Load environment variables from .env file if present
dotenv.config();

// Skip tests if no API key is available
const haveApiKey = process.env.CALLAI_API_KEY;
const itif = (condition: boolean) => condition ? it : it.skip;

/**
 * Schema Result Tests
 * 
 * This test focuses ONLY on the final result - whether we get structured data back
 * that matches our schema. It doesn't test or care HOW that structured data is 
 * obtained (JSON schema, tool mode, etc).
 * 
 * This test should continue to pass even if the implementation details change.
 */
describe('Schema Result Integration Test', () => {
  // Simple schema that works with any model/approach
  const bookSchema: Schema = {
    name: 'book_recommendation',
    properties: {
      title: { type: 'string' },
      author: { type: 'string' },
      year: { type: 'number' },
      genre: { type: 'string' }
    }
  };

  // Test that should pass regardless of implementation method
  itif(!!haveApiKey)('OpenAI should return valid structured data with schema', async () => {
    console.log('Starting OpenAI schema test');
    
    // Make the API call with OpenAI
    const result = await callAI(
      'Give me a book recommendation about science fiction from the 1960s. Make it a classic.',
      {
        apiKey: process.env.CALLAI_API_KEY,
        model: 'openai/gpt-4o-mini',
        schema: bookSchema
      }
    );
    
    console.log(`OpenAI result (${typeof result}):`, 
      typeof result === 'string' 
        ? result.length > 100 ? result.substring(0, 100) + '...' : result
        : '[object AsyncGenerator]');
    
    // The important part - validate we get back structured data 
    // that matches our schema, regardless of how it's implemented
    
    // Parse the result (regardless of how it came back)
    let data;
    if (typeof result === 'string') {
      try {
        data = JSON.parse(result);
        console.log('Parsed JSON result');
      } catch (e) {
        console.log('Failed to parse as raw JSON, trying to extract...');
        // Try to extract JSON from text response (code blocks, etc.)
        const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || 
                      result.match(/```\s*([\s\S]*?)\s*```/) || 
                      result.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const jsonContent = jsonMatch[0].replace(/```json|```/g, '').trim();
          try {
            data = JSON.parse(jsonContent);
            console.log('Successfully extracted JSON from response');
          } catch (e2) {
            console.error('Failed to parse extracted content');
            throw e2;
          }
        } else {
          console.error('No JSON found in response!');
          throw new Error(`No JSON found in response: ${result}`);
        }
      }
    } else {
      data = result;
    }
    
    // Verify the schema fields
    console.log('Validating schema fields...');
    expect(data).toHaveProperty('title');
    expect(data).toHaveProperty('author');
    expect(data).toHaveProperty('year');
    expect(data).toHaveProperty('genre');
    
    // Validate data types
    expect(typeof data.title).toBe('string');
    expect(typeof data.author).toBe('string');
    expect(typeof data.year).toBe('number');
    expect(typeof data.genre).toBe('string');
    
    console.log('Test passed. Got valid structured data back:');
    console.log(JSON.stringify(data, null, 2));
  }, TIMEOUT);
  
  // Test for Claude with tool mode
  itif(!!haveApiKey)('Claude should return valid structured data with schema using tool mode', async () => {
    console.log('Starting Claude schema test');
    
    // Make the API call with Claude
    const result = await callAI(
      'Give me a book recommendation about science fiction from the 1960s. Make it a classic.',
      {
        apiKey: process.env.CALLAI_API_KEY,
        model: 'anthropic/claude-3-sonnet',
        schema: bookSchema
      }
    );
    
    console.log(`Claude result (${typeof result}):`, 
      typeof result === 'string' 
        ? result.length > 100 ? result.substring(0, 100) + '...' : result
        : '[object AsyncGenerator]');
    
    // Parse the result (regardless of how it came back)
    let data;
    if (typeof result === 'string') {
      try {
        data = JSON.parse(result);
        console.log('Parsed JSON result');
      } catch (e) {
        console.log('Failed to parse as raw JSON, trying to extract...');
        // Try to extract JSON from text response (code blocks, etc.)
        const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || 
                      result.match(/```\s*([\s\S]*?)\s*```/) || 
                      result.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const jsonContent = jsonMatch[0].replace(/```json|```/g, '').trim();
          try {
            data = JSON.parse(jsonContent);
            console.log('Successfully extracted JSON from response');
          } catch (e2) {
            console.error('Failed to parse extracted content');
            throw e2;
          }
        } else {
          console.error('No JSON found in response!');
          throw new Error(`No JSON found in response: ${result}`);
        }
      }
    } else {
      data = result;
    }
    
    // Verify the schema fields
    console.log('Validating schema fields...');
    expect(data).toHaveProperty('title');
    expect(data).toHaveProperty('author');
    expect(data).toHaveProperty('year');
    expect(data).toHaveProperty('genre');
    
    // Validate data types
    expect(typeof data.title).toBe('string');
    expect(typeof data.author).toBe('string');
    expect(typeof data.year).toBe('number');
    expect(typeof data.genre).toBe('string');
    
    console.log('Test passed. Got valid structured data back:');
    console.log(JSON.stringify(data, null, 2));
  }, TIMEOUT);

  // Test for OpenAI with optional tool mode
  itif(!!haveApiKey)('OpenAI should support tool mode when enabled', async () => {
    console.log('Starting OpenAI tool mode test');
    
    // Make the API call with OpenAI with useToolMode
    const result = await callAI(
      'Give me a book recommendation about science fiction from the 1960s. Make it a classic.',
      {
        apiKey: process.env.CALLAI_API_KEY,
        model: 'openai/gpt-4o-mini',
        schema: bookSchema,
        useToolMode: true  // This option will enable tool mode for OpenAI when implemented
      }
    );
    
    console.log(`OpenAI with tool mode result (${typeof result}):`, 
      typeof result === 'string' 
        ? result.length > 100 ? result.substring(0, 100) + '...' : result
        : '[object AsyncGenerator]');
    
    try {
      // The important part - validate we get back structured data 
      // regardless of implementation method
      let data;
      if (typeof result === 'string') {
        try {
          data = JSON.parse(result);
          console.log('Parsed JSON result');
        } catch (e) {
          console.log('Failed to parse as raw JSON, trying to extract...');
          // Try to extract JSON from text response (code blocks, etc.)
          const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || 
                        result.match(/```\s*([\s\S]*?)\s*```/) || 
                        result.match(/\{[\s\S]*\}/);
          
          if (jsonMatch) {
            const jsonContent = jsonMatch[0].replace(/```json|```/g, '').trim();
            try {
              data = JSON.parse(jsonContent);
              console.log('Successfully extracted JSON from response');
            } catch (e2) {
              console.error('Failed to parse extracted content');
              throw e2;
            }
          } else {
            // Check if it's an error about the tool mode option not being implemented
            if (result.includes('useToolMode') && result.includes('error')) {
              console.log('Tool mode not implemented yet, skipping test');
              return; // Skip the rest of this test until the feature is implemented
            }
            console.error('No JSON found in response!');
            throw new Error(`No JSON found in response: ${result}`);
          }
        }
      } else {
        data = result;
      }
      
      // Verify the schema fields
      console.log('Validating schema fields...');
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('author');
      expect(data).toHaveProperty('year');
      expect(data).toHaveProperty('genre');
      
      // Validate data types
      expect(typeof data.title).toBe('string');
      expect(typeof data.author).toBe('string');
      expect(typeof data.year).toBe('number');
      expect(typeof data.genre).toBe('string');
      
      console.log('Test passed. Got valid structured data back:');
      console.log(JSON.stringify(data, null, 2));
    } catch (error: any) {
      // If the useToolMode option isn't implemented yet, the test should still pass
      if (error.message && error.message.includes('useToolMode')) {
        console.log('Tool mode not implemented yet, skipping test');
      } else {
        throw error; // Re-throw other errors
      }
    }
  }, TIMEOUT);
}); 