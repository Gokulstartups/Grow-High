export function databaseError(error){
 if(error.status)return error;
 const code=String(error.code||'');
 const known=code==='23505'||code.includes('CONSTRAINT_UNIQUE')?[409,'A matching record already exists. Refresh and try again.']:
 ['40001','40P01','55P03','57014'].includes(code)?[409,'The workspace is busy or changed. Refresh and retry the operation.']:
 code==='23503'?[409,'A referenced record is missing or no longer available.']:
 code.startsWith('08')||['ECONNREFUSED','ECONNRESET','ETIMEDOUT','57P01','57P03','53300'].includes(code)?[503,'The database is temporarily unavailable. Please retry shortly.']:null;
 if(!known)return error;return Object.assign(new Error(known[1]),{status:known[0],code});
}
