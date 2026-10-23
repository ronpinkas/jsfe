/** Compile trusted, JSON-saved JavaScript helpers once for a loaded flow definition.
 * Only explicit arguments and approved platform helpers enter their lexical scope.
 * Runtime/session values are passed by callers; a registry never captures a session.
 */
const identifier=/^[A-Za-z_$][\w$]*$/;
const forbidden=new Set(['fn','__proto__','prototype','constructor']);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
export function compileNamedFunctions(definitions,{approvedFunctions={},label='flow'}={}) {
   if(definitions===undefined)return undefined;
   if(!definitions||typeof definitions!=='object'||Array.isArray(definitions))throw new Error(`Named functions ${label}: functions must be an object`);
   const names=Object.keys(definitions);
   if(!names.length)return undefined;
   const fail=message=>{throw new Error(`Named functions ${label}: ${message}`);};
   const validName=(name,kind)=>{
      if(typeof name!=='string'||!identifier.test(name)||forbidden.has(name))fail(`invalid ${kind} ${String(name)}`);
      return name;
   };
   const statements=names.map(name=>{
      validName(name,'function name');
      const spec=definitions[name];
      if(!spec||typeof spec!=='object'||Array.isArray(spec))fail(`${name} must declare parameters and body`);
      if(!Array.isArray(spec.parameters))fail(`${name}.parameters must be an array`);
      const parameters=spec.parameters.map(parameter=>{
         if(!parameter||typeof parameter!=='object'||Array.isArray(parameter)||typeof parameter.name!=='string'||!identifier.test(parameter.name))fail(`${name} has an invalid parameter`);
         return (parameter.rest===true?'...':'')+parameter.name;
      });
      if(new Set(parameters).size!==parameters.length)fail(`${name} has duplicate parameters`);
      if(!Array.isArray(spec.body)||spec.body.some(line=>typeof line!=='string'))fail(`${name}.body must be an array of JavaScript lines`);
      const expressionName=spec.name===undefined?name:validName(spec.name,'function expression name');
      return `const ${name}=function ${expressionName}(${parameters.join(',')}){\n${spec.body.join('\n')}\n};`;
   });
   // Local declaration names shadow same-named approved helpers exactly as ordinary JS lexical bindings do.
   const approvedNames=Object.keys(approvedFunctions).filter(name=>identifier.test(name)&&name!=='fn'&&!own(definitions,name));
   let factory;
   try {
      factory=new Function('fn',...approvedNames,`"use strict";\n${statements.join('\n')}\nreturn [${names.join(',')}];`);
   }catch(error){fail(`invalid JavaScript: ${error.message}`);}
   const namespace=Object.create(null);
   const functions=factory(namespace,...approvedNames.map(name=>approvedFunctions[name]));
   names.forEach((name,index)=>{namespace[name]=functions[index];});
   return Object.freeze(namespace);
}
