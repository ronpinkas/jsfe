/** Consume the one-time conversational offer shared by question and terminal presenters. */
export function takeChoiceOffer(cargo) {
   const offer=cargo.switchOffer;
   cargo.switchOffer=null;
   return offer&&typeof offer==='object'&&!Array.isArray(offer)&&typeof offer.flow==='string'&&offer.flow?offer:null;
}
