/** Deterministic cardinal grammar for explicitly named monetary phrases. No conversation or intent policy. */
const EN_SMALL='zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const EN_TENS={twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const ES_SMALL={cero:0,uno:1,un:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,diecinueve:19,veinte:20,veintiuno:21,veintiun:21,veintiuna:21,veintidos:22,veintitres:23,veinticuatro:24,veinticinco:25,veintiseis:26,veintisiete:27,veintiocho:28,veintinueve:29};
const ES_TENS={treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,ochenta:80,noventa:90};
const ES_HUNDREDS={doscientos:200,doscientas:200,trescientos:300,trescientas:300,cuatrocientos:400,cuatrocientas:400,quinientos:500,quinientas:500,seiscientos:600,seiscientas:600,setecientos:700,setecientas:700,ochocientos:800,ochocientas:800,novecientos:900,novecientas:900};
const NUMBER_WORDS=new Set([...EN_SMALL,...Object.keys(EN_TENS),...Object.keys(ES_SMALL),...Object.keys(ES_TENS),...Object.keys(ES_HUNDREDS),'hundred','thousand','million','cien','ciento','mil','millon','millones','and','y','a','an']);
const MAJOR=new Set(['dollar','dollars','dolar','dolares']);
const MINOR=new Set(['cent','cents','centavo','centavos']);
const plain=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const valid=value=>Number.isSafeInteger(value)&&value>=0;
function englishSmall(words) {
   if(words.length===1&&EN_SMALL.includes(words[0]))return EN_SMALL.indexOf(words[0]);
   const tens=EN_TENS[words[0]],unit=EN_SMALL.indexOf(words[1]);
   return tens&&(words.length===1||words.length===2&&unit>0&&unit<10)?tens+(words.length===2?unit:0):null;
}
function englishHundreds(words) {
   const hundred=words.indexOf('hundred');if(hundred<0)return englishSmall(words);
   if(hundred!==1||words.lastIndexOf('hundred')!==1)return null;
   const lead=['a','an'].includes(words[0])?1:EN_SMALL.indexOf(words[0]);if(lead<1||lead>9)return null;
   let tail=words.slice(2);if(tail[0]==='and'){if(tail.length===1)return null;tail=tail.slice(1);}
   const rest=tail.length?englishSmall(tail):0;return rest===null||tail.length&&rest===0?null:lead*100+rest;
}
function spanishSmall(words) {
   if(words.length===1&&Object.hasOwn(ES_SMALL,words[0]))return ES_SMALL[words[0]];
   const tens=ES_TENS[words[0]],unit=ES_SMALL[words[2]];
   return tens&&(words.length===1||words.length===3&&words[1]==='y'&&unit>0&&unit<10)?tens+(words.length===3?unit:0):null;
}
function spanishHundreds(words) {
   if(words[0]==='cien')return words.length===1?100:null;
   if(words[0]==='ciento'){const rest=spanishSmall(words.slice(1));return rest!==null&&rest>0?100+rest:null;}
   const lead=ES_HUNDREDS[words[0]];if(!lead)return spanishSmall(words);
   const rest=words.length>1?spanishSmall(words.slice(1)):0;return rest===null||words.length>1&&rest===0?null:lead+rest;
}
function scaled(words,lang,level=0) {
   const lower=lang==='en'?englishHundreds:spanishHundreds;
   if(level===2)return lower(words);
   const scales=lang==='en'?[['million'],['thousand']]:[['millon','millones'],['mil']],scale=level===0?1000000:1000;
   const positions=words.map((word,index)=>scales[level].includes(word)?index:-1).filter(index=>index>=0);
   if(!positions.length)return scaled(words,lang,level+1);
   if(positions.length!==1)return null;
   const at=positions[0],left=words.slice(0,at),right=words.slice(at+1),lead=left.length?lang==='en'&&left.length===1&&['a','an'].includes(left[0])?1:lower(left):lang==='es'&&scale===1000?1:null;
   if(lead===null||lead<1||lead>999)return null;
   if(lang==='es'&&scale===1000000&&((lead===1)!==(words[at]==='millon')))return null;
   if(lang==='en'&&right[0]==='and'){if(right.length===1)return null;right.shift();}
   const rest=right.length?scaled(right,lang,level+1):0;
   return rest===null||right.length&&rest===0?null:lead*scale+rest;
}
function cardinal(words) {
   if(words.length===1&&/^\d+$/.test(words[0])){const value=Number(words[0]);return valid(value)?value:null;}
   if(!words.length||words.length>24||words.some(word=>/\d/.test(word)))return null;
   const en=scaled(words,'en'),es=scaled(words,'es');return en!==null?en:es;
}
/** [{value,start,end}] covers the entire currency phrase, including a connected cents clause.
 * Only readings containing actual cardinal words are returned; existing numeric parsing retains ownership of digits. */
export function scanSpokenMoney(answer) {
   const raw=String(answer ?? ''),tokens=[...raw.matchAll(/\p{L}+|\d+(?:[.,]\d+)?|[^\s]/gu)].map(match=>({word:plain(match[0]),start:match.index,end:match.index+match[0].length}));
   const units=[],invalid=[];
   for(let i=0;i<tokens.length;i++) {
      const unit=tokens[i].word;if(!MAJOR.has(unit)&&!MINOR.has(unit))continue;
      let start=i;
      while(start>0&&(NUMBER_WORDS.has(tokens[start-1].word)||/^\d+$/.test(tokens[start-1].word)||tokens[start-1].word==='-'&&start>1&&NUMBER_WORDS.has(tokens[start-2].word)))start--;
      while(start<i&&['and','y'].includes(tokens[start].word))start++;
      const numberTokens=tokens.slice(start,i),words=numberTokens.filter(token=>token.word!=='-').map(token=>token.word);
      // The established numeric reader owns digit-only connector phrases, including Spanish 'un' before cents.
      const digitOnly=words.some(word=>/^\d+$/.test(word))&&words.every(word=>/^\d+$/.test(word)||['and','y','un'].includes(word));
      const numericCents=MINOR.has(unit)&&words.length===2&&words[0]==='un'&&/^\d+$/.test(words[1]);
      if(digitOnly&&words.length>1&&!numericCents)continue;
      const value=cardinal(numericCents?words.slice(1):words);
      const spoken=!digitOnly&&words.some(word=>/[a-z]/.test(word));
      if(value===null){if(spoken)invalid.push({start:tokens[start].start,end:tokens[i].end,reason:'invalid_cardinal'});continue;}
      // A detached sign or a negative phrase is not a positive payment amount.
      if(start>0&&['-','minus','negative','menos','negativo'].includes(tokens[start-1].word)){if(spoken)invalid.push({start:tokens[start-1].start,end:tokens[i].end,reason:'negative_amount'});continue;}
      units.push({value,unit:MAJOR.has(unit)?'major':'minor',spoken,start:tokens[start].start,end:tokens[i].end});
   }
   const readings=[];
   for(let i=0;i<units.length;i++) {
      const first=units[i],next=units[i+1];
      if(first.unit==='major'&&next?.unit==='minor'&&/^(?:and|y|con)$/i.test(raw.slice(first.end,next.start).trim())) {
         if(next.value>99){if(first.spoken||next.spoken)invalid.push({start:first.start,end:next.end,reason:'invalid_fractional_cents'});i++;continue;}
         if(first.spoken||next.spoken)readings.push({value:Math.round(first.value*100+next.value)/100,start:first.start,end:next.end});
         i++;continue;
      }
      if(first.spoken)readings.push({value:first.unit==='minor'?first.value/100:first.value,start:first.start,end:first.end});
   }
   return {readings,invalid};
}

export function readSpokenMoney(answer) {return scanSpokenMoney(answer).readings;}
