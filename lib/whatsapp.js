export function parseRecipients(raw){
 const values=String(raw||'').split(',').map(x=>x.trim().replace(/^\+/,'')).filter(Boolean);
 if(!values.length||values.length>10||values.some(x=>!/^[1-9]\d{7,14}$/.test(x)))throw Error('Invalid WhatsApp recipients');
 return [...new Set(values)];
}
export async function sendWhatsApp(report,e=process.env,send=fetch){
 const keys=['WA_ACCESS_TOKEN','WA_PHONE_NUMBER_ID','WA_TEMPLATE','WA_GRAPH_VERSION','STJ_PUBLIC_URL'];
 if(!keys.every(k=>e[k])||!(e.WA_RECIPIENTS||e.WA_RECIPIENT))return {notification:'Not configured',results:[]};
 let recipients;
 try{recipients=parseRecipients(e.WA_RECIPIENTS||e.WA_RECIPIENT);if(!/^v\d+\.\d+$/.test(e.WA_GRAPH_VERSION)||!/^\d+$/.test(e.WA_PHONE_NUMBER_ID)||new URL(e.STJ_PUBLIC_URL).protocol!=='https:')throw Error()}catch{return {notification:'Invalid WhatsApp configuration',results:[]}}
 const labels={daily:'Daily operations report',requisition:'Requisition request',incident:'Incident and maintenance report'};
 const values=[labels[report.type],report.id,report.staff,'Sign in to review the report',e.STJ_PUBLIC_URL.replace(/\/$/,'')+'/'];
 const results=await Promise.all(recipients.map(async (to,index)=>{
 try{
 const response=await send('https://graph.facebook.com/'+e.WA_GRAPH_VERSION+'/'+e.WA_PHONE_NUMBER_ID+'/messages',{method:'POST',headers:{Authorization:'Bearer '+e.WA_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'template',template:{name:e.WA_TEMPLATE,language:{code:e.WA_LANGUAGE||'en_US'},components:[{type:'body',parameters:values.map(text=>({type:'text',text}))}]}}),signal:AbortSignal.timeout(10000)});
 const json=await response.json(),id=json.messages?.[0]?.id;
 return response.ok&&id?{recipient_slot:index+1,status:'Accepted by WhatsApp API',message_id:id}:{recipient_slot:index+1,status:'Send failed',message_id:null};
 }catch{return {recipient_slot:index+1,status:'Send failed or unconfirmed',message_id:null}}
 }));
 const accepted=results.filter(r=>r.message_id).length;
 return {notification:accepted+' of '+results.length+' accepted by WhatsApp API'+(accepted<results.length?'; remaining failed or unconfirmed':''),results};
}
