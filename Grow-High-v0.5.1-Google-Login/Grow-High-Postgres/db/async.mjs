export async function mapAsync(items,fn){const result=[];for(let i=0;i<items.length;i++)result.push(await fn(items[i],i,items));return result;}
