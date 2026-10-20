/** Address interpretation and geocoder projection, independent of collection order. */
export function addressDraft(raw) {
   const said=String(raw || '').trim();
   const zip=/(?:^|\D)(\d{5})(?:-\d{4})?(?:\D|$)/.exec(said)?.[1] || '';
   const unit=/(?:\bapt\.?|\bunit|#)\s*([\w-]+)/i.exec(said)?.[1] || '';
   let street=said.split(/[,\n]/)[0].replace(/\s*(?:apt\.?|unit|#)\s*[\w-]+.*$/i,'').trim();
   street=street.replace(/\s+\d{5}(?:-\d{4})?$/,'').replace(/\s+[A-Z]{2}$/,'').trim();
   if(!/^\d{1,6}\s+\S/.test(street))street='';
   return {zip,street,unit,said:street};
}
export function zipLocation(result) {
   const components=result?.components || result?.results?.[0]?.address_components || [];
   const part=(kind,short=false)=>{const row=components.find(c=>(c.types || []).includes(kind));return row ? String(short?row.short_name || row.long_name:row.long_name || row.short_name) : '';};
   const city=part('locality')||part('postal_town')||part('sublocality'),state=part('administrative_area_level_1',true);
   return result?.status==='OK'&&city&&state?{city,state,line:city+', '+state}:null;
}
export function streetLocation(result,said,zip) {
   const row=result?.results?.[0] || result || {},components=row.components || row.address_components || [];
   const part=kind=>components.find(c=>(c.types || []).includes(kind))?.long_name || '';
   const types=row.types || [],locationType=row.location_type || row.geometry?.location_type || '';
   const exact=result?.status==='OK'&&row.partial_match!==true&&types.includes('street_address')&&locationType==='ROOFTOP'&&part('street_number')&&part('route')&&(!part('postal_code')||part('postal_code')===zip);
   return {street:exact?part('street_number')+' '+part('route'):String(said).trim(),said:String(said).trim(),verified:!!exact};
}
export function resolvedAddress(values,data) {
   const unit=/^(none|no|ninguno|ninguna|sin|no hay)$/i.test(String(values.unit || ''))?'':String(values.unit || '').replace(/^(apt\.?|unit|#)\s*/i,'');
   const street=data.street?.street || values.street || '',city=data.location?.line || values.city_state || '';
   return {street,unit,city,zip:String(values.zip || ''),line:street+(unit?' Apt '+unit:'')+', '+city+' '+values.zip,verified:data.street?.verified===true,said:data.street?.said || values.street || ''};
}
