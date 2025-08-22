import { WorkflowEngine } from '../dist/index.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'warn',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

//Get key from environment variable or configuration
const apiKeys = {
   openai: process.env.OPENAI_API_KEY
};

// Provides the AI response for the engine
async function fetchAiResponse(systemInstruction, userMessage) {
  try {
    logger.info(`fetchAiResponse called with system instruction length: ${systemInstruction.length}, user message: "${userMessage}"`);
    
    //logger.warn(`System instruction: "${systemInstruction}"\nUser message: "${userMessage}"`);
    
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKeys.openai}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini-2025-04-14",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userMessage }
        ],
        temperature: 0.1,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      throw new Error(`AI API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content.trim();
    
    logger.debug(`fetchAiResponse completed, response length: ${aiResponse.length}`);
    return aiResponse;
    
  } catch (error) {
    logger.error(`fetchAiResponse error: ${error.message}`);
    throw new Error(`AI communication failed: ${error.message}`);
  }
}

const toolsRegistry = [
  {
    id: 'GetJoke',
    name: 'Get Joke',
    description: 'Fetches a random joke',
    parameters: { type: 'object', properties: {}, required: [] },
    implementation: {
      type: 'http',
      url: 'https://icanhazdadjoke.com/',
      method: 'GET',
      headers: { 'Accept': 'text/plain' },
      responseMapping: { type: 'template', template: '{{response}}' }
    }
  },
  {
    id: 'GetWeather',
    name: 'Get Weather',
    description: 'Fetches weather for a city',
    parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
    implementation: {
      type: 'http',
      url: 'https://wttr.in/{city}',
      pathParams: ['city'],
      customQuery: 'format=3',
      method: 'GET',
      responseMapping: { type: 'template', template: '{{response}}' }
    }
  }
];

const flowsMenu = [
  {
    id: 'abilities-demo',
    name: 'AbilitiesDemo',
    prompt: 'Demo engine abilities',
    steps: [
      { type: 'SAY', value: 'Welcome! Type "joke" for a joke, or a city name for weather.' },
      { type: 'SAY-GET', variable: 'input', value: 'Your input:' },
      { type: 'CASE', branches: {
        'condition:{{input.toLowerCase() === "joke"}}': {
          type: 'CALL-TOOL', tool: 'GetJoke', variable: 'result',
        },
        'default': {
          type: 'CALL-TOOL', tool: 'GetWeather', args: { city: '{{input}}' }, variable: 'result',
        }
      } },
      { type: 'SAY', value: 'Result: {{result}}' }
    ]
  }
];

const engine = new WorkflowEngine(
  logger,
  fetchAiResponse,
  flowsMenu,
  toolsRegistry
);

async function runDemo() {
  const sessionContext = engine.initSession('demo-user', 'demo-session');

  let userInput = 'show me your abilities';
  console.log(`User input: ${userInput}`);

  let response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(response);

  userInput = 'joke';
  console.log(`User input: ${userInput}`);
  response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(response);

  userInput = 'show me your abilities';
  console.log(`User input: ${userInput}`);

  response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(response);

  userInput = 'London';
  console.log(`User input: ${userInput}`);
  response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(response);
}

runDemo();
