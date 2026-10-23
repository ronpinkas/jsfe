/** Authoring migration support. Captures live functions without putting executable objects in JSON. */
const originals=new WeakMap(),expressions=new Map();
export function copyAuthorSpec(value){
 if(Array.isArray(value))return value.map(copyAuthorSpec);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,copyAuthorSpec(item)]));
 return value;
}
export function captureAuthorSpec(flow,component,spec){const saved={component,spec:copyAuthorSpec(spec)};originals.set(flow,saved);return flow;}
export function capturedAuthorSpec(flow){return originals.get(flow);}
export function rememberExpression(source,fn,args){expressions.set(source,{source:Function.prototype.toString.call(fn),name:fn.name,args:[...args]});return source;}
export function authoredExpressions(){return expressions;}

export function inheritFlowDeclaration(source,target){const saved=originals.get(source);if(saved)originals.set(target,saved);return target;}
