/** Closed channel requests: courtesy is allowed; other content is not a switch command. */
import assert from 'node:assert/strict';
import {isAnswer,pickChoice} from '../dist/helpers/answer.js';
let checks=0;const check=(text,expected)=>{assert.equal(isAnswer(text,'text'),expected,JSON.stringify(text));checks++;};
for(const text of [
 'text','Text.','texto','SMS','message','text message','mensaje de texto','WhatsApp',
 'by text','via SMS','por texto','por mensaje de texto','en WhatsApp',
 'please text','text please','por favor texto','texto por favor','por favor por texto','sí, por texto','yes, by text please',
 '*text me*','**text me**','_text me_','__text me__',"please **text me**",
 'text me','text me instead','message me','send me a text','send me a text message please','escríbeme','escríbame por favor','mándame un texto','envíame un mensaje',
 'I want to continue by text','I would like to continue by text','I would like text','I prefer text',"I'd like to continue by text",'I’d like to continue by text',
 'can we continue by SMS?','could you please text me?','switch me to text please',"let's switch to text",'go on by text','continue with me by text',
 'quiero seguir por texto','quiero continuar por mensaje','¿podemos continuar por texto?','prefiero por texto','mejor por texto','sigamos por texto','cámbiame a texto',
])check(text,true);
for(const text of [
 '','yes','sí','please','por favor','9','123456','4111111111111111','text@example.com',
 'A ver, ahorita me acaban de mandar un código espérenme dónde me llegó en este mensaje',
 'sí, Dónde está el texto que te mandaron','I never got the text message','me llegó por texto pero no lo veo',
 'where is the text?','the message you sent','I am reading the text','where does WhatsApp show the code?',
 'Can you text me the code again?','please text me my verification code','send me a text with the code','could you please send me the code by text?',
 'escríbeme el código','mándame un texto con el código','¿dónde está el mensaje que dice escríbeme?',
 "You told me 'text me' but where is the code?",'You told me text me but where is the code?',
 '"text me"',"'text me'",'‘text me’','“text me”','\\"text me\\"',
 '~~text me~~','~~text me','text me~~','`text me','text me`','please `text me',
 '`text me`','``text me``','```text me```','```\ntext me\n```','```text me','~~~\ntext me\n~~~','~~~text me',
 '> text me','   > text me','>> text me','please `text me`','por favor `texto`',
 'do not text me',"don't text me",'no quiero texto','no por texto','never switch to text','no. text me',
 'later text me','text me tomorrow','wait, let me find the message','please wait while I read your text',
 'text me and make a payment','switch to text and charge my card','text me or transfer me',
])check(text,false);
// The surrounding courtesy grammar must not reintroduce substring matching.
for(const prefix of ['please ','um, ','yes, ','sí, ','por favor '])for(const suffix of ['',' please',' por favor']){
 check(prefix+'text'+suffix,true);check(prefix+'text me the code'+suffix,false);
}
assert.equal(isAnswer('telegram','text',['telegram']),true);checks++;
assert.equal(isAnswer('please telegram','text',['telegram']),true);checks++;
assert.equal(isAnswer('where is the telegram message','text',['telegram']),false);checks++;
assert.equal(isAnswer('"telegram"','text',['telegram']),false);checks++;
for(const text of ['please `telegram`','```telegram```','> telegram','~~~\ntelegram\n~~~']){assert.equal(isAnswer(text,'text',['telegram']),false);checks++;}
for(const text of ['text','please text','I want to continue by text','sí, por texto']){
 assert.equal(pickChoice(text,[{key:'yes',words:[],exact:true},{key:'no',words:['2']}],false),'');checks++;
}
console.log(`Text request grammar: all ${checks} checks passed`);
