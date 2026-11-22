'use strict';
// Indian numbering system (Crore/Lakh/Thousand) used in issuer-side financial PDFs.
const below20=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven',
 'Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function small(n){
 n=Math.floor(n);
 if(n<20)return below20[n];
 if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+below20[n%10]:'');
 return below20[Math.floor(n/100)]+' Hundred'+(n%100?' '+small(n%100):'');
}
function integer(n){
 n=Math.floor(Number(n));
 if(!Number.isSafeInteger(n)||n<0)throw new Error('Unsupported Indian currency amount');
 if(n===0)return 'Zero';
 const units=[[1000000000,'Arab'],[10000000,'Crore'],[100000,'Lakh'],[1000,'Thousand'],[100,'Hundred']];
 const words=[];
 for(const [value,name] of units){if(n>=value){const count=Math.floor(n/value);words.push(small(count)+' '+name);n%=value;}}
 if(n)words.push(small(n));
 return words.join(', ');
}
function amount(n){
 const paise=Math.round(Number(n)*100);
 if(!Number.isSafeInteger(paise)||paise<0)throw new Error('Invalid currency value');
 const rupees=Math.floor(paise/100),fraction=paise%100;
 return 'INR '+integer(rupees)+(fraction?' and '+integer(fraction)+' Paisa':'')+' Only';
}
module.exports={integer,amount};
