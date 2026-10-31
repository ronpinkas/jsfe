/** An answer that repeats an option exactly as the question offered it is that option's word (owner 2026-10-31; prod 10-31
 * 11:15: "Sí para cancelar" at "diga SÍ para cancelar" was not understood). Only the whole echo of an offered option. */
import assert from 'node:assert/strict';
import {withoutPromptEcho,pickChoice,STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
let checks=0;const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
const ES='Solo para confirmar: desea cancelar su suscripción a Monitoreo de Crédito en la cuenta que termina en 5, 4, 2, 8. Presione 1 o diga SÍ para cancelar, o presione 2 o diga NO para no cancelar.';
const EN='Just to confirm: you want to cancel your Credit Monitor on the account ending in 5428. Press 1 or say YES to cancel, or press 2 or say NO to keep it.';
const TEXT_ES='Solo para confirmar: desea cancelar su suscripción. Escriba SÍ para cancelar, o escriba NO para no cancelar.';
const Q=[EN,ES];
// The echo of an offered option is its word.
for(const [said,word] of [['Sí para cancelar','sí'],['Sí para cancelar.','sí'],['sí, para cancelar','sí'],['Si para cancelar','sí'],['Sí, sí para cancelar','sí'],
 ['Sí para cancelar, por favor','sí'],['Por favor, sí para cancelar','sí'],['Yes to cancel','yes'],['yes to cancel please','yes'],
 ['No para no cancelar','no'],['No to keep it.','no']])eq(withoutPromptEcho(said,Q),word,said);
eq(withoutPromptEcho('Sí para cancelar',[TEXT_ES]),'sí','the text wording (Escriba SÍ para cancelar)');
// Multi-word options and other connectives of the prompts.
eq(withoutPromptEcho('Otra cuenta para usar otra cuenta',['Para usar otra cuenta, escriba OTRA CUENTA para usar otra cuenta.']),'otra cuenta','a multi-word option');
eq(withoutPromptEcho('Yes to submit it',['Before I submit it: a request. Type YES to submit it, or type NO.']),'yes','YES to submit it');
eq(withoutPromptEcho('Sí para continuar',['¿Procedo? Presione 1 o diga SÍ para continuar, o presione 2 o diga NO si entendí mal.']),'sí','SÍ para continuar');
eq(withoutPromptEcho('Dirección para cambiar la dirección de entrega',['¿Qué desea hacer con su entrega? Presione 1 o diga DIRECCIÓN para cambiar la dirección de entrega, 2 o FECHA para cambiar la fecha, o 3 o CANCELAR para cancelarla.']),'dirección','an option among several');
eq(withoutPromptEcho('Cancelar para cancelarla',['¿Qué desea hacer con su entrega? Presione 1 o diga DIRECCIÓN para cambiar la dirección de entrega, 2 o FECHA para cambiar la fecha, o 3 o CANCELAR para cancelarla.']),'cancelar','the last option');
// Never more than the whole echo of an option the question offered.
for(const said of ['Sí para cancelar la cuenta','Sí para pagar','Sí quiero cancelar','No, para cancelar','Yes to pay','Sí','Para cancelar','cancelar',
 'Yes, to cancel my other account too','¿Sí para cancelar?','Yes to cancel?','Quiero hablar para cancelar'])eq(withoutPromptEcho(said,Q),said,said);
eq(withoutPromptEcho('Motivo para cancelar',['Por favor dígame el motivo para cancelar.']),'Motivo para cancelar','lowercase words are not an offered option');
eq(withoutPromptEcho('Sí para cancelar',['Presione 1 o diga SÍ para continuar.']),'Sí para cancelar','the echo of another option');
eq(withoutPromptEcho('Sí para cancelar',[]),'Sí para cancelar','no question');
eq(withoutPromptEcho('Sí para cancelar',undefined),'Sí para cancelar','no question given');
eq(withoutPromptEcho(undefined,Q),'','no answer');
// The cancel confirmation's own choices: the echo confirms, and only it.
const cs=[{key:'yes',exact:true,phrases:['proceed','sí cancelar','yes cancel']},{key:'no',phrases:['no cancelar','keep it']}];
eq(pickChoice('Sí para cancelar',cs,false),'','before: the echo picks nothing');
eq(pickChoice(withoutPromptEcho('Sí para cancelar',Q),cs,false),'yes','the echo confirms');
eq(pickChoice(withoutPromptEcho('No para no cancelar',Q),cs,false),'no','the NO echo declines');
eq(pickChoice(withoutPromptEcho('Sí para pagar',Q),cs,false),'','an echo of a pay prompt never confirms a cancel');
eq(pickChoice(withoutPromptEcho('¿Sí para cancelar?',Q),cs,false),'','a question never confirms');
eq(STANDARD_FUNCTIONS.withoutPromptEcho,withoutPromptEcho,'exported to flow expressions');
console.log(`prompt echo: all ${checks} checks passed`);
