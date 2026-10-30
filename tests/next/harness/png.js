const { inflateSync } = require('node:zlib');
function crc(bytes) {
  let c=0xffffffff;
  for (const b of bytes) { c^=b; for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0); }
  return (c^0xffffffff)>>>0;
}
function validatePNG(bytes) {
  if(bytes.length>2097152 || !bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw new Error('Not PNG');
  let p=8,width,height,colour,depth,end=false,alpha=false;const data=[];
  while(p+12<=bytes.length) {
    const size=bytes.readUInt32BE(p),tag=bytes.toString('ascii',p+4,p+8),stop=p+8+size;
    if(stop+4>bytes.length || crc(bytes.subarray(p+4,stop))!==bytes.readUInt32BE(stop))throw new Error('Corrupt PNG');
    if(p===8 && (tag!=='IHDR'||size!==13))throw new Error('Missing PNG header');
    if(tag==='IHDR') {width=bytes.readUInt32BE(p+8);height=bytes.readUInt32BE(p+12);depth=bytes[p+16];colour=bytes[p+17];if(!width||!height||width>1000||height>1000||bytes[p+20]!==0)throw new Error('Unsupported PNG');alpha=[4,6].includes(colour);}
    if(tag==='tRNS')alpha=true;
    if(tag==='IDAT')data.push(bytes.subarray(p+8,stop));
    p=stop+4;if(tag==='IEND'){end=true;break;}
  }
  if(!end||p!==bytes.length||!data.length||!alpha)throw new Error('Incomplete or opaque PNG');
  const channels=({0:1,2:3,3:1,4:2,6:4})[colour];
  if(!channels||![1,2,4,8,16].includes(depth))throw new Error('Unsupported PNG colour');
  const expected=(Math.ceil(width*channels*depth/8)+1)*height;
  if(inflateSync(Buffer.concat(data),{maxOutputLength:expected+1}).length!==expected)throw new Error('Incomplete pixels');
  return {width,height};
}

module.exports = { validatePNG };
