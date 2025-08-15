import { WorkflowEngine } from '../dist/index.js';

const flowsMenu = [
  {
    id: 'test-safe-functions',
    name: 'TestSafeFunctions',
    prompt: 'Test safe function calls',
    steps: [
      { type: 'SAY-GET', variable: 'input', value: 'Enter a word:' },
      { 
        type: 'CASE', 
        branches: {
          'condition:{{input.toLowerCase() === "hello"}}': { type: 'SAY', value: 'You said hello!' },
          'condition:{{input.toUpperCase() === "WORLD"}}': { type: 'SAY', value: 'You said WORLD!' },
          'condition:{{input.trim().length > 5}}': { type: 'SAY', value: 'That\'s a long word!' },
          'default': { type: 'SAY', value: 'You said: {{input}}' }
        }
      }
    ]
  }
];

const engine = new WorkflowEngine(
  null, // No logger for this demo
  null, // No AI callback for this demo
  flowsMenu,
  [] // No tools needed
);

async function runDemo() {
  let sessionContext = engine.initSession(null, 'demo-user', 'demo-session');

  console.log('Testing safe function calls in expressions...\n');

  // Test 1: hello
  let userInput = 'test-safe-functions';
  console.log(`User input: ${userInput}`);
  sessionContext = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${sessionContext.response}`);

  userInput = 'hello';
  console.log(`User input: ${userInput}`);
  sessionContext = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${sessionContext.response}\n`);

  // Test 2: world  
  userInput = 'test-safe-functions';
  console.log(`User input: ${userInput}`);
  sessionContext = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${sessionContext.response}`);

  userInput = 'world';
  console.log(`User input: ${userInput}`);
  sessionContext = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${sessionContext.response}\n`);

  // Test 3: long word
  userInput = 'test-safe-functions';
  console.log(`User input: ${userInput}`);
  sessionContext = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${sessionContext.response}`);

  userInput = 'supercalifragilisticexpialidocious';
  console.log(`User input: ${userInput}`);
  sessionContext = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${sessionContext.response}\n`);
}

runDemo().catch(console.error);
