import { WorkflowEngine } from '../dist/index.js';

const flowsMenu = [
   {
      id: 'hello-world',
      name: 'HelloWorld',
      prompt: 'Greeting',
      description: 'A simple flow that greets the user',
      version: '1.0',
      steps: [
         { type: 'SAY-GET', id: 'getName', variable: 'userName', value: 'Hello! What is your name?' },
         { type: 'SAY', id: 'greetUser', value: 'Nice to meet you, {{userName}}!' }
      ]
   }
];

const engine = new WorkflowEngine(
   null, // No logger for this demo
   null, // No AI callback for this demo
   flowsMenu,
   [], // No tools
);

async function runDemo() {
   const sessionContext = engine.initSession('demo-user');
   
   // Fake User prompt - should trigger the 'hello-world' flow
   let userInput = 'hello-world'; 
   console.log(`User input: ${userInput}`);
   let response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
   // When the engine executes a flow, it returns a response string.
   console.log(`Engine response: ${response}`);

   // Fake User input for the next step
   userInput = 'Alice';
   console.log(`User input: ${userInput}`);
   response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
   // The HelloWorld flow should respond with a greeting
   console.log(`Engine response: ${response}`);
}

runDemo();
