/** A performer projection updates current session facts only; it never orchestrates another flow or tool. */
const LOCALS=['form','formSnapshot','request','result','key'];
const identifier=/^[A-Za-z_$][\w$]*$/;
export function validateActionProjection(steps,id='performer') {
   if(!Array.isArray(steps))throw new Error(`Flow contract ${id}: project must be a SET-step array`);
   for(const step of steps) {
      if(!step||step.type!=='SET'||step.onFail||step.branches||!identifier.test(step.variable || '')||LOCALS.concat(['cargo','arguments','eval']).includes(step.variable)||step.value===undefined)
         throw new Error(`Flow contract ${id}: project permits only SET expressions with local temporary variables`);
      if(typeof step.value==='string'&&step.value.includes('{{'))throw new Error(`Flow contract ${id}: project uses expressions, not message templates`);
   }
   return steps;
}
/** Compile both ordinary and late-result paths from exactly the same validated declaration. */
export function actionProjectionExpression(steps,bindings) {
   validateActionProjection(steps);
   const variables=[...new Set(steps.map(step=>step.variable))];
   const expressions=steps.map(step=>`${step.variable}=(${typeof step.value==='string'?step.value:JSON.stringify(step.value)});`).join('\n');
   return `(function(${LOCALS.join(',')}){${variables.length?'var '+variables.join(',')+';':''}${expressions}return true;})(${LOCALS.map(name=>bindings[name]).join(',')})`;
}
