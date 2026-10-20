import assert from 'node:assert/strict';
import {takeChoiceOffer,STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const offer={flow:'account-switch',words:['another account','otra cuenta'],text:'To use another account, type ANOTHER ACCOUNT.',text_es:'Para usar otra cuenta, escriba OTRA CUENTA.'};
const cargo={switchOffer:offer};assert.equal(takeChoiceOffer(cargo),offer);assert.equal(cargo.switchOffer,null);assert.equal(takeChoiceOffer(cargo),null);
assert.equal(STANDARD_FUNCTIONS.takeChoiceOffer,takeChoiceOffer);
for(const invalid of [undefined,'another account',[],{flow:7},{text:'invalid'}]){cargo.switchOffer=invalid;assert.equal(takeChoiceOffer(cargo),null);assert.equal(cargo.switchOffer,null);}
console.log('choice offer: all 14 checks passed');
