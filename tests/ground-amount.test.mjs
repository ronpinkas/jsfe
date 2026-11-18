/** An amount's digits come only from the caller's own words (owner 2026-11-18): groundAmount finds where the caller said the
 * number a model chose, as a whole number, with its money word; null when the caller did not say it. */
import assert from 'node:assert/strict';
import {groundAmount} from '../dist/helpers/match-inputs.js';
const said=(u,v)=>groundAmount(u,v)?.text ?? null;
const cases=[
 ['43, 4, 97. ¿Ya?','43',null,'a piece of a number said in groups (prod 11-17 CA3a7c)'],
 ['the usual payment, like last time','30 dollars',null,'not said'],
 ['Un 2 dólares más que me faltan, pedí de 10.','2','2 dólares','its money word kept (prod 11-17 CAef4)'],
 ['Hacer una 1 pago.','1.00','1','cents the model added: the number said, its rules decide'],
 ['quiero pagar 157','157.95','157','the whole number said'],
 ['pagar ciento cincuenta y tres dólares','153','ciento cincuenta y tres dólares','spoken'],
 ['$85.20 por favor','85.20','$85.20','written cents with the mark'],
 ['quiero pagar $100','100','$100','the mark before it'],
 ['pago de 1,500','1500','1,500','a thousands comma'],
 ['mi cuenta 55967192 y pago 40','40','40','beside an account number'],
 ['pago 40 de 55967192','5596',null,'a piece of the account number'],
 ['','40',null,'no words'],
];
for(const [u,v,want,why] of cases)assert.equal(said(u,v),want,`${why}: ${JSON.stringify(u)} ${v}`);
console.log(`ground-amount: ${cases.length} checks passed`);
