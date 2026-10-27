import {buildAnalytics} from './analytics.mjs';
export function answerBusinessQuestion(data,question,today){
 const q=question.trim().toLowerCase().replace(/’/g,"'"),f={},cash=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(v/100);
 if(/^(hey|hi|hello|hiya|good (morning|afternoon|evening))[!.,\s]*$/.test(q))return {answer:'Hello! How can I help with Grow High today? You can ask about stock, sales, invoices, purchases or expenses, or ask how to use a feature.',links:[]};
 if(/^(what(?:'s| is) (?:the |today'?s )?date(?: today)?|today'?s date|date today|what day is (?:it|today))[?!.,\s]*$/.test(q))return {answer:'Today is '+new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'full'}).format(new Date(today+'T12:00:00Z'))+' (India time).',links:[]};
 if(/^(thanks|thank you|thankyou)[!.,\s]*$/.test(q))return {answer:'You’re welcome! Let me know what you would like to check next.',links:[]};
 if(/^(help|what can you do|who are you|how do you work|are you (?:an? )?ai)[?!.,\s]*$/.test(q))return {answer:'I am Grow High’s local business assistant. I calculate answers from your saved records and explain supported workflows. I am not connected to a generative AI model yet, so I cannot answer every general question or infer causes. Try “stock for Laptop Battery”, “sales this month”, or “how do I create an invoice?”.',links:[]};
 if(/\bhow\b/.test(q)&&/\b(create|add|make|share|send|export|import)\b/.test(q)){
  if(/\b(share|send)\b/.test(q)&&/\b(invoice|bill|quotation|quote)\b/.test(q))return {answer:'Open Quotation & Billing, choose Share beside the document, then choose Email draft or WhatsApp draft. Review the recipient and message. Download the document or save it as PDF and attach it before sending.',links:['billing']};
  if(/\b(invoice|quotation|quote|bill)\b/.test(q))return {answer:'Add the customer in Customers first. Then open Quotation & Billing → Create document, choose the document type and customer, add line items, and save the draft. Review it before issuing. Issuing an inventory invoice deducts stock.',links:['billing','customers']};
  if(/\b(import|export)\b/.test(q))return {answer:'For inventory imports, open Inventory → Import Excel, download the template, fill plain values, and upload the .xlsx file. Use Export Excel for inventory downloads or Reports for business reports.',links:['inventory','reports']};
  if(/\b(product|part|inventory)\b/.test(q))return {answer:'Open Inventory, choose Products or Parts & Components, and select Add product or Add part. Save the details, then use Stock ± to record an opening balance.',links:['inventory']};
 }
 let period='all recorded dates';
 if(/today/.test(q)){f.from=f.to=today;period=today;}
 else if(/this month/.test(q)){f.from=today.slice(0,7)+'-01';f.to=today;period=f.from+' to '+f.to;}
 else if(/last month/.test(q)){const d=new Date(today+'T00:00:00Z');d.setUTCDate(0);f.to=d.toISOString().slice(0,10);f.from=f.to.slice(0,7)+'-01';period=f.from+' to '+f.to;}
 const dates=q.match(/\d{4}-\d{2}-\d{2}/g);if(dates?.length){f.from=dates[0];f.to=dates[1]||dates[0];period=f.from+' to '+f.to;}
 const product=(data.products||[]).filter(p=>q.includes(p.name.toLowerCase())||q.includes(p.sku?.toLowerCase()||'\u0000')).sort((a,b)=>b.name.length-a.name.length)[0];
 const customer=(data.customers||[]).find(c=>q.includes(c.name.toLowerCase()));const supplier=(data.suppliers||[]).find(c=>q.includes(c.name.toLowerCase()));
 if(product)f.product=product.id;if(customer)f.customer=customer.id;if(supplier)f.supplier=supplier.id;
 if(/forecast|predict|why|cause/.test(q))return {answer:'I cannot establish causes or forecast reliably from these records. Generative AI is not configured. Ask for a measured comparison, for example “sales this month”, then review the evidence in Analytics.',links:['analytics']};
 const a=buildAnalytics(data,f,today);let answer,links=['analytics'];
 const list=(xs,fn)=>xs.slice(0,10).map(fn).join('; ')+(xs.length>10?`; and ${xs.length-10} more. Open the related screen for details.`:'');
 if(/stock|inventory|reorder|parts?/.test(q)&&!/sales|sold|revenue/.test(q)){
 let ps=a.products;if(/parts?/.test(q))ps=ps.filter(p=>p.type==='Part');if(/low|reorder/.test(q))ps=ps.filter(p=>p.quantity<=p.reorder);if(/out of stock/.test(q))ps=ps.filter(p=>p.quantity===0);
 answer=`Current stock: ${ps.length} matching items. ${list(ps,p=>`${p.name}: ${p.quantity} units; reorder ${p.reorder}`)||'No matching items.'} Stock is a current snapshot, not historical.`;links=['inventory'];
 }else if(/overdue|unpaid|receivable/.test(q)){
 const ds=(data.documents||[]).filter(d=>d.type==='Invoice'&&d.status==='Issued'&&d.total>d.paid+(d.credited||0)&&(!/overdue/.test(q)||d.due<today)&&(!f.customer||d.customerId===f.customer)&&(!f.from||d.date>=f.from)&&(!f.to||d.date<=f.to)&&(!f.product||d.lines.some(l=>l.productId===f.product)));
 answer=`${ds.length} matching unpaid invoices; whole-invoice outstanding balance ${cash(ds.reduce((n,d)=>n+d.total-d.paid-(d.credited||0),0))}. ${list(ds,d=>d.number+' · '+d.customer.name+' · due '+d.due)}`;links=['billing'];
 }else if(/purchase|supplier|vendor/.test(q)){answer=`Purchases created during ${period}: ${a.purchases.length}, ordered value before tax ${cash(a.kpis.purchaseValue)}. ${list(a.purchases,p=>p.number+' · '+p.supplier+' · '+p.status)}`;links=['purchases'];
 }else if(/expense|spend|costs/.test(q)&&!/profit|revenue/.test(q)){answer=`Recorded operating expenses during ${period}: ${cash(a.kpis.expenses)}. ${list(a.byExpense,e=>e.name+': '+cash(e.value))} Expenses are not linked to products or customers in this edition.`;links=['expenses','analytics'];
 }else if(/quotation|quote|invoice|bill/.test(q)&&!/sales|revenue|profit/.test(q)){const ds=a.documents.filter(d=>!/quotation|quote/.test(q)||d.type==='Quotation');answer=`${ds.length} documents during ${period}. ${list(ds,d=>d.number+' · '+d.type+' · '+d.status+' · '+cash(d.total))}`;links=['billing'];
 }else if(/customer|client/.test(q)&&!/sales|revenue|profit/.test(q)){answer=`${a.kpis.customers} customers have issued invoices during ${period}. ${list(a.byCustomer,c=>c.name+': '+cash(c.value))}`;links=['customers','analytics'];
 }else if(/sales|revenue|profit|sold|top|best|margin/.test(q)){answer=`During ${period}${product?' for '+product.name:''}: net invoiced revenue ${cash(a.kpis.revenue)}, snapshot product costs ${cash(a.kpis.cost)}, recorded expenses ${cash(a.kpis.expenses)}, estimated operating profit ${cash(a.kpis.profit)}. ${list(a.byProduct,p=>p.name+': '+cash(p.value))}. Revenue excludes tax, drafts and cancellations and subtracts issued credits. Expenses are workspace-level, not allocated to individual products.`;
 }else if(/task|activit|work|pending/.test(q)){const ts=(data.tasks||[]).filter(t=>t.status==='Pending');answer=`${ts.length} pending activities, ${ts.filter(t=>t.due<=today).length} due today or overdue. ${list(ts,t=>t.title+' · '+t.due)}`;links=['home'];
 }else if(/hello|^hi\b|help/.test(q)){answer='I can calculate sales, stock, purchases, expenses, unpaid invoices and pending tasks from this workspace. Try “top products this month”, “stock for [product name]”, or “expenses last month”. Dates can be YYYY-MM-DD to YYYY-MM-DD.';}
 else {links=[];answer='I could not confidently match that question to a supported calculation. Please name sales, stock, purchases, expenses, invoices, customers or tasks, with an optional product name and date range. I will not invent an answer.';}
 return {answer,links};
}
