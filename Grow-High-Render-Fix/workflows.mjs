// Domain workflows use the host's tenant-scoped repository and transaction.
export function createWorkflows(ctx) {
  const {db, get, list, insert, update, audit, authorize, fail, str, num, money, date, today, stock, sequence, now}=ctx;
  function policy(t){return list(t,'workflowSettings')[0]||{invoiceApproval:false,lowStock:true,overdue:true};}
  function once(t,key,fn){
    key=str(key,'request key',100,true);
    const previous=db.prepare('SELECT result FROM idempotency WHERE tenant=? AND key=?').get(t,key);
    if(previous)return JSON.parse(previous.result);
    const result=fn();db.prepare('INSERT INTO idempotency VALUES(?,?,?)').run(t,key,JSON.stringify(result));return result;
  }
  function requireApproval(u,d){
    if(!policy(u.tenant).invoiceApproval||d.type!=='Invoice')return;
    const approved=list(u.tenant,'approvals').find(a=>a.documentId===d.id&&a.documentVersion===d.version&&a.status==='Approved');
    if(!approved)fail('This invoice needs approval for its current version before it can be issued.',409);
  }
  function nextDate(value,frequency,anchor){
    const d=new Date(value+'T12:00:00Z');
    if(frequency==='Weekly')d.setUTCDate(d.getUTCDate()+7);
    else {d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(anchor,end));}
    return d.toISOString().slice(0,10);
  }
  function runRecurring(t,until=today()){
    let count=0;
    for(let schedule of list(t,'recurring').filter(s=>s.active)){
      let safety=0;
      while(schedule.nextRun<=until&&safety++<12){
        if(schedule.endDate&&schedule.nextRun>schedule.endDate){schedule=update(t,schedule.id,'recurring',{...schedule,active:false},schedule.version);break;}
        const key='recurring:'+schedule.id+':'+schedule.nextRun;
        if(!list(t,'jobs').some(j=>j.key===key)){
          const {id,version,created,updated,...template}=schedule.template;
          const dueDate=new Date(schedule.nextRun+'T12:00:00Z');dueDate.setUTCDate(dueDate.getUTCDate()+schedule.dueDays);
          const draft=insert(t,'documents',{...template,type:'Invoice',number:sequence(t,'INV'),status:'Draft',paid:0,credited:0,source:'',sourceInvoiceId:'',linkedInvoice:'',stockApplied:false,date:schedule.nextRun,due:dueDate.toISOString().slice(0,10),scheduleId:schedule.id});
          insert(t,'jobs',{key,type:'Recurring invoice draft',status:'Completed',recordId:draft.id,number:draft.number,date:schedule.nextRun});
          audit({tenant:t,name:'Automation'},'Created recurring draft '+draft.number,draft.id);count++;
        }
        schedule=update(t,schedule.id,'recurring',{...schedule,nextRun:nextDate(schedule.nextRun,schedule.frequency,schedule.anchorDay),runs:(schedule.runs||0)+1},schedule.version);
      }
    }
    return {count};
  }
  function handle(u,route,b){
    const t=u.tenant;
    if(route==='/api/purchases/receive'){
      authorize(u,'purchases');
      const perform=()=>{
        const p=get(t,b.id,'purchases');if(!['Ordered','Partially received'].includes(p.status))fail('No quantities remain to be received.');
        const lines=p.lines.map(l=>({...l,received:l.received||0,returned:l.returned||0}));
        const requested=b.lines||lines.map((l,index)=>({index,quantity:l.quantity-l.received}));
        if(!Array.isArray(requested)||requested.length>100)fail('Invalid receipt lines.');
        const seen=new Set(),received=[];
        for(const item of requested){const index=num(item.index,'line index',0,lines.length-1);if(seen.has(index))fail('Duplicate receipt line.');seen.add(index);const amount=num(item.quantity,'received quantity',0,100000);if(!amount)continue;const l=lines[index];if(amount>l.quantity-l.received)fail('Receipt exceeds the remaining ordered quantity.');stock(u,l.productId,p.warehouse,amount,'Goods received',p.number);l.received+=amount;received.push({index,productId:l.productId,name:l.name,quantity:amount,cost:l.cost});}
        if(!received.length)fail('Enter at least one received quantity.');
        const receipt=insert(t,'receipts',{purchaseId:p.id,number:sequence(t,'GRN'),purchaseNumber:p.number,warehouse:p.warehouse,lines:received,date:date(b.date||today()),actor:u.name});
        const status=lines.every(l=>l.received===l.quantity)?'Received':'Partially received';
        const result=update(t,p.id,'purchases',{...p,lines,status,received:status==='Received'?today():p.received||''},p.version);audit(u,'Recorded '+receipt.number+' for '+p.number,p.id);return result;
      };
      return b.key?once(t,'receipt:'+b.key,perform):perform();
    }
    if(route==='/api/purchases/return'){
      authorize(u,'purchases');return once(t,'supplier-return:'+str(b.key,'request key',80,true),()=>{
        const p=get(t,b.id,'purchases'),lines=p.lines.map(l=>({...l,received:l.received??(p.status==='Received'?l.quantity:0),returned:l.returned||0}));
        const index=num(b.index,'line index',0,lines.length-1),quantity=num(b.quantity,'return quantity',1,100000),l=lines[index];
        if(quantity>l.received-l.returned)fail('Return exceeds the quantity received and not yet returned.');
        const reason=str(b.reason,'return reason',500,true);stock(u,l.productId,p.warehouse,-quantity,'Supplier return: '+reason,p.number);l.returned+=quantity;
        update(t,p.id,'purchases',{...p,lines},p.version);const result=insert(t,'supplierReturns',{purchaseId:p.id,number:sequence(t,'PRN'),productId:l.productId,quantity,cost:l.cost,reason,date:today()});audit(u,'Recorded supplier return '+result.number,p.id);return result;
      });
    }
    if(route==='/api/supplier-bills'){
      authorize(u,'documents');const supplier=get(t,b.supplierId,'suppliers'),reference=str(b.reference,'supplier invoice number',100,true);
      if(list(t,'supplierBills').some(x=>x.supplierId===supplier.id&&x.reference.toLowerCase()===reference.toLowerCase()))fail('That supplier invoice is already recorded.');
      let purchase=null;if(b.purchaseId){purchase=get(t,b.purchaseId,'purchases');if(purchase.supplierId!==supplier.id)fail('Purchase order belongs to another supplier.');}
      const amount=money(b.amount);if(!amount)fail('Enter a positive bill total.');
      const result=insert(t,'supplierBills',{supplierId:supplier.id,supplier:supplier.name,purchaseId:purchase?.id||'',reference,amount,paid:0,date:date(b.date),due:date(b.due),status:'Open'});audit(u,'Recorded supplier invoice '+reference,result.id);return result;
    }
    if(route==='/api/supplier-payments'){
      authorize(u,'documents');return once(t,'supplier-payment:'+str(b.key,'request key',80,true),()=>{
        const bill=get(t,b.billId,'supplierBills'),amount=money(b.amount),reference=str(b.reference,'payment reference',100,true);
        if(amount<=0||amount>bill.amount-bill.paid)fail('Payment exceeds the remaining supplier balance.');
        if(list(t,'supplierPayments').some(p=>p.reference===reference))fail('Payment reference already exists.');
        const result=insert(t,'supplierPayments',{billId:bill.id,supplierId:bill.supplierId,reference,amount,date:date(b.date||today())});update(t,bill.id,'supplierBills',{...bill,paid:bill.paid+amount,status:bill.paid+amount===bill.amount?'Paid':'Partially paid'},bill.version);audit(u,'Recorded payment to '+bill.supplier,bill.id);return result;
      });
    }
    if(route==='/api/expenses/correct'){
      authorize(u,'expenses');const e=get(t,b.id,'expenses'),reason=str(b.reason,'correction reason',500,true),amount=money(b.amount);
      if(!amount)fail('Expense amount must be positive.');
      const result=update(t,e.id,'expenses',{...e,description:str(b.description,'description',200,true),category:str(b.category,'category',80,true),amount,date:date(b.date),reference:str(b.reference||'','reference',100),correctionReason:reason},b.version);audit(u,'Corrected expense: '+reason,e.id);return result;
    }
    if(route==='/api/documents/delete-draft'){
      authorize(u,'documents');const d=get(t,b.id,'documents');if(d.status!=='Draft')fail('Only an unissued draft can be deleted.');if(b.version!==d.version)fail('Refresh this draft before deleting.',409);
      if(d.source){const quote=get(t,d.source,'documents');if(quote.linkedInvoice===d.id)update(t,quote.id,'documents',{...quote,status:'Accepted',linkedInvoice:''},quote.version);}
      // Soft deletion preserves the version history and prevents number reuse.
      const result=update(t,d.id,'documents',{...d,status:'Deleted'},d.version);audit(u,'Deleted draft '+d.number,d.id);return result;
    }
    if(route==='/api/approvals/request'){
      authorize(u,'documents');const d=get(t,b.id,'documents');if(d.type!=='Invoice'||d.status!=='Draft')fail('Only a draft invoice can be submitted.');
      if(list(t,'approvals').some(a=>a.documentId===d.id&&a.documentVersion===d.version&&['Pending','Approved'].includes(a.status)))fail('This version has already been submitted.');
      const result=insert(t,'approvals',{documentId:d.id,documentNumber:d.number,documentVersion:d.version,requestedBy:u.id,requester:u.name,status:'Pending',note:''});audit(u,'Requested approval for '+d.number,d.id);return result;
    }
    if(route==='/api/approvals/decide'){
      if(!['owner','administrator','manager'].includes(u.role))fail('An owner, administrator, or manager must review this invoice.',403);
      const a=get(t,b.id,'approvals'),d=get(t,a.documentId,'documents');if(a.requestedBy===u.id)fail('A different team member must approve this invoice.',403);
      if(a.status!=='Pending'||a.documentVersion!==d.version||d.status!=='Draft')fail('This request is no longer current. Submit the current draft again.',409);
      if(!['Approved','Rejected'].includes(b.status))fail('Choose Approve or Reject.');const result=update(t,a.id,'approvals',{...a,status:b.status,reviewer:u.name,reviewerId:u.id,note:str(b.note||'','review note',500)},a.version);audit(u,b.status+' '+d.number,d.id);return result;
    }
    if(route==='/api/workflow-settings'){
      authorize(u,'settings');const previous=list(t,'workflowSettings')[0];const data={invoiceApproval:!!b.invoiceApproval,lowStock:b.lowStock!==false,overdue:b.overdue!==false};const result=previous?update(t,previous.id,'workflowSettings',data,previous.version):insert(t,'workflowSettings',data);audit(u,'Updated approval and activity rules');return result;
    }
    if(route==='/api/recurring'){
      authorize(u,'documents');const template=get(t,b.documentId,'documents');if(template.type!=='Invoice'||['Cancelled','Deleted'].includes(template.status))fail('Select an active invoice as the template.');
      const nextRun=date(b.nextRun);if(nextRun<today())fail('First generation date must be today or later.');if(!['Weekly','Monthly'].includes(b.frequency))fail('Select weekly or monthly recurrence.');
      const endDate=b.endDate?date(b.endDate):'';if(endDate&&endDate<nextRun)fail('End date must follow the first generation date.');
      const result=insert(t,'recurring',{name:str(b.name,'schedule name',100,true),documentId:template.id,template,frequency:b.frequency,nextRun,anchorDay:Number(nextRun.slice(8)),endDate,dueDays:num(b.dueDays||14,'payment terms days',0,365),active:true,runs:0});audit(u,'Scheduled recurring drafts: '+result.name,result.id);return result;
    }
    if(route==='/api/recurring/toggle'){
      authorize(u,'documents');const s=get(t,b.id,'recurring');const result=update(t,s.id,'recurring',{...s,active:!s.active},b.version);audit(u,(result.active?'Resumed':'Paused')+' recurring drafts',s.id);return result;
    }
    if(route==='/api/recurring/run'){
      authorize(u,'documents');return runRecurring(t);
    }
    return undefined;
  }
  return {handle,requireApproval,policy,runRecurring,nextDate};
}
