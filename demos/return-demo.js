import { WorkflowEngine } from '../dist/index.js';

const flowsMenu = [
   {
      id: 'return-test',
      name: 'ReturnTest',
      prompt: 'Testing RETURN step',
      description: 'A flow that tests the RETURN step functionality',
      version: '1.0',
      steps: [
         { type: 'RETURN', id: 'returnStep', value: '"Hello from RETURN!"' }
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

   // Trigger the return-test flow
   let userInput = 'return-test';
   console.log(`User input: ${userInput}`);
   let response = await engine.updateActivity({ role: 'user', content: userInput }, sessionContext);
   console.log(`Engine response: ${response.response}`);

   // The flow should have terminated and returned the value
   console.log('Demo completed - RETURN step should have terminated the flow');
}

runDemo();
