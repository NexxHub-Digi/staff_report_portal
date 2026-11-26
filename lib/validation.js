const required={daily:['date','shift','activities','power'],requisition:['date','department','priority','reason'],incident:['date','category','severity','location','time','description','action']};
const optional={daily:['fuel','rooms','outstanding','notes'],requisition:['needed','notes'],incident:['followup']};
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
export function validate(type,data){
 if(!Object.hasOwn(required,type)||!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid report.');
 const clean={};for(const k of [...required[type],...optional[type]]){const v=data[k]??'';if(typeof v!=='string'||v.length>2000||(required[type].includes(k)&&!v.trim()))throw Error('Invalid or missing '+k);if(v.trim())clean[k]=v.trim()}
 if(!validDate(clean.date)||(clean.needed&&!validDate(clean.needed)))throw Error('Invalid date.');
 if(type==='incident'&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clean.time))throw Error('Invalid incident time.');
 if(type==='requisition'){if(!['Routine','Urgent','Critical'].includes(clean.priority)||!Array.isArray(data.items)||data.items.length<1||data.items.length>50)throw Error('Invalid priority or item list.');
 clean.items=data.items.map(i=>{if(!i||typeof i.item!=='string'||!i.item.trim()||i.item.length>150||typeof i.qty!=='string'||!i.qty.trim()||i.qty.length>60||typeof i.cost!=='number'||!Number.isFinite(i.cost)||i.cost<0||i.cost>1e9)throw Error('Invalid item.');return {item:i.item.trim(),qty:i.qty.trim(),cost:Math.round(i.cost*100)/100}});
 }return clean;
}
