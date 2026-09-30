/** Restore PDF visual lines; content streams may put all labels before their values. */
export function vaPageText(items:Array<{str:string;transform:number[];width?:number;height?:number}>) {
 const sorted=items.filter(i=>i.str.trim()).map(i=>({text:i.str,x:i.transform[4],y:i.transform[5]})).sort((a,b)=>b.y-a.y||a.x-b.x);
 const rows:Array<{y:number;items:typeof sorted}>=[];
 for(const item of sorted){const row=rows.at(-1);if(row&&Math.abs(row.y-item.y)<=2.5)row.items.push(item);else rows.push({y:item.y,items:[item]})}
 return rows.map(row=>row.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ')).join('\n');
}
