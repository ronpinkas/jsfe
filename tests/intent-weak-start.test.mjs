// Stage 1: a weak start with a split route is "None" (owner 2026-10-29). Jev's 'any' below 0.55 and its route giving the
// top flow under 70%: unsure a flow is wanted and unsure which, so the Guru answers. The 15 cases are the prod turns of
// 2026-10-29 the rule changes (of 1,261 stage-1 decisions), with their recorded any and top route shares; the rest
// pin what it leaves alone.
import assert from 'node:assert/strict';
import { decodeFlowSystemOne } from '../dist/host/intent-stages.js';

let checks = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const decode = (any, shares) => {
  const names = Object.keys(shares);
  const rest = Math.max(0, 1 - names.reduce((t, n) => t + shares[n], 0));
  const flows = [...names, 'Other'].map((name) => ({ id: name, name, description: '' }));
  const probabilities = { ...shares, Other: rest };
  return decodeFlowSystemOne({ any: { noul: any }, route: { choice: names[0], probabilities } }, { flows }).flowName;
};

const changed = [
  ['Quiero saber un Delivery', 0.53, { CuracaoTrackOrder: 0.54, StoreDelivery: 0.38, ShopifyQLStorePolicies: 0.05 }],
  ['problemas sobre envíos', 0.54, { MoneyTransfer: 0.45, StoreDelivery: 0.27, CuracaoTrackOrder: 0.20 }],
  ['1800737', 0.53, { AccountInfo: 0.43, ProductIssue: 0.37, ServiceCase: 0.11 }],
  ['… quitarme representante.', 0.54, { LiveAgentRequested: 0.59, CancelService: 0.29, UpdateContactInfo: 0.07 }],
  ['Yeah, because I made those payments a lot a while ago.', 0.51, { ServiceCase: 0.51, AccountInfo: 0.45, PurchaseInquiry: 0.01 }],
  ['A dónde?', 0.54, { DeliveryChange: 0.62, CuracaoTrackOrder: 0.15, StoreDelivery: 0.11 }],
  ['Sí, está lista la bicicleta que compré hace tres días la iban a armar.', 0.54, { StoreDelivery: 0.47, CuracaoTrackOrder: 0.34, ProductIssue: 0.10 }],
  ['Acceder a mi cuenta.', 0.53, { AccountInfo: 0.58, MyAccountHelp: 0.41, AccountSwitchRequest: 0.01 }],
  ['Le dije ponle sable vienendo.', 0.53, { DeliveryChange: 0.54, StoreDelivery: 0.18, ServiceCase: 0.11 }],
  ['Mi cuenta está bloqueada ya.', 0.52, { ServiceCase: 0.44, MyAccountHelp: 0.20, AccountPinRecovery: 0.19 }],
  ['Me puedes ayudar tú porque no tengo la cuenta.', 0.50, { MyAccountHelp: 0.67, LiveAgentRequested: 0.12, AccountInfo: 0.10 }],
  ['servicio de cuenta crédito un crédito y qué número pongo no el de crédito crédito', 0.54, { AccountInfo: 0.37, ServiceCase: 0.35, UpdateContactInfo: 0.10 }],
  ['What date is the 1214 do?', 0.51, { AccountInfo: 0.69, ChargeInquiry: 0.18, PurchaseInquiry: 0.04 }],
  ['you have the World Tech 1 in person?', 0.51, { LiveAgentRequested: 0.53, ShopifyQLProductSearch: 0.37, CheckSubscriptionStatus: 0.04 }],
  ['Una pregunta, Esta cancelación afecta mi credito?', 0.51, { CancelService: 0.64, AccountInfo: 0.30, ShopifyQLStorePolicies: 0.03 }],
];
for (const [said, any, shares] of changed) eq(decode(any, shares), 'None', `"${said}": weak start, split route → None`);

eq(decode(0.53, { AccountInfo: 0.70, ServiceCase: 0.20 }), 'AccountInfo', 'a weak start with a clear route (70%) starts its flow');
eq(decode(0.55, { AccountInfo: 0.40, ServiceCase: 0.35 }), 'AccountInfo', 'a start at 0.55 starts its flow, however split the route');
eq(decode(0.90, { AccountInfo: 0.40, ServiceCase: 0.35 }), 'AccountInfo', 'a strong start with a split route starts the top flow');
eq(decode(0.49, { AccountInfo: 0.95 }), 'None', 'below the 0.5 cut is None, as before');

console.log(`intent weak start: ${checks} checks passed`);
