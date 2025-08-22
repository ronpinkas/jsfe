import { WorkflowEngine } from '../dist/index.js';

const toolsRegistry = [
  {
    id: 'GetWeather',
    name: 'Get Weather',
    description: 'Fetches current weather for a city',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' }
      },
      required: ['city']
    },
    implementation: {
      type: 'http',
      url: 'https://wttr.in/{city}',
      pathParams: ['city'],
      customQuery: 'format=3',
      method: 'GET',
      responseMapping: {
        type: 'template',
        template: 'Weather: {{response}}'
      }
    }
  }
];

const flowsMenu = [
  {
    id: 'weather-demo',
    name: 'WeatherDemo',
    prompt: 'Get weather',
    steps: [
      { type: 'SAY-GET', variable: 'city', value: 'Enter city:' },
      { type: 'CALL-TOOL', tool: 'GetWeather', args: { city: '{{city}}' }, variable: 'weather' },
      { type: 'SAY', value: 'Result: {{weather}}' }
    ]
  }
];

const engine = new WorkflowEngine(
  null, // No logger for this demo
  null, // No AI callback for this demo
  flowsMenu,
  toolsRegistry
);

async function runDemo() {
  const sessionContext = engine.initSession('demo-user', 'demo-session');

  let userInput = 'weather-demo';
  console.log(`User input: ${userInput}`);
  let response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${response}`);

  userInput = 'London';
  console.log(`User input: ${userInput}`);
  response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${response}`);
}

runDemo();
