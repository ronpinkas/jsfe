import { WorkflowEngine } from '../dist/index.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'warn',  // Changed to debug to see HTTP requests
  format: winston.format.printf(({ level, message }) => {
    return `${level}: ${message}`;
  }),
  transports: [
    new winston.transports.Console()
  ]
});


const flowsMenu = [
  {
    id: 'security-test',
    name: 'SecurityTest',
    prompt: 'Test security features',
    steps: [
      { type: 'SAY-GET', variable: 'input', value: 'Enter a word:' },
      { 
        type: 'CASE',
        branches: {
          // This should work - safe method
          'condition:{{input.toLowerCase() === "hello"}}': { type: 'SAY', value: 'You said hello!' },
          // This should work - safe method with length
          'condition:{{input.trim().length > 5}}': { type: 'SAY', value: 'That\'s a long word!' },
          'default': { type: 'SAY', value: 'You said: {{input}} (lowercase: {{input.toLowerCase()}})' }
        }
      }
    ]
  },
  {
    id: 'malicious-test',
    name: 'MaliciousTest', 
    prompt: 'Test malicious code blocking',
    steps: [
      { type: 'SAY-GET', variable: 'input', value: 'This should fail:' },
      { 
        type: 'CASE',
        branches: {
          // This should be blocked - standalone function
          'condition:{{eval("malicious") === "code"}}': { type: 'SAY', value: 'This should not execute!' },
          'default': { type: 'SAY', value: 'Security worked - blocked malicious code' }
        }
      }
    ]
  }
];

const engine = new WorkflowEngine(
  logger,
  null,
  flowsMenu,
  []
);

async function runSecurityTest() {
  const sessionContext = engine.initSession('demo-user', 'demo-session');

  console.log('=== Testing Safe Methods ===');
  
  let userInput = 'security-test';
  console.log(`User input: ${userInput}`);
  let response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${response}`);

  userInput = 'hello';
  console.log(`User input: ${userInput}`);
  response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${response}\n`);

  console.log('=== Testing Malicious Code Blocking ===');
  
  userInput = 'malicious-test';
  console.log(`User input: ${userInput}`);
  response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${response}`);

  userInput = 'anything';
  console.log(`User input: ${userInput}`);
  response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
  console.log(`Engine response: ${response}`);
}

runSecurityTest().catch(console.error);
