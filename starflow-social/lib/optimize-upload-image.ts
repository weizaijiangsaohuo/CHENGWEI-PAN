// Browser-only best-effort image optimization before upload.
// Skips animation; failure never loses the original user-selected file.
// Does not inspect/exfiltrate EXIF, GPS or other private metadata.
export async function optimizeImageForPost(file:File):Promise<File>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))return file;
 if(typeof window==='undefined'||typeof document==='undefined')return file;
 let url:string|null=null;
 try{
  url=URL.createObjectURL(file);
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{
   const element=new Image();
   element.onload=()=>resolve(element);
   element.onerror=()=>reject(new Error('图片解码失败'));
   element.src=url!;
  });
  const width=img.naturalWidth, height=img.naturalHeight;
  if(!width||!height)return file;
  // Avoid huge canvas allocations on mobile even for very large pixel images.
  const factor=Math.min(1,2048/Math.max(width,height));
  const w=Math.max(1,Math.round(width*factor));
  const h=Math.max(1,Math.round(height*factor));
  if(factor===1&&file.size<1100*1024)return file;
  const canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return file;
  ctx.drawImage(img,0,0,w,h);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',0.82));
  if(!blob||blob.type!=='image/webp'||blob.size===0||blob.size>=file.size)return file;
  const name=file.name.replace(/\.[^.]+$/,'')+'.webp';
  return new File([blob],name,{type:'image/webp',lastModified:file.lastModified});
 }catch{return file;}
 finally{if(url)URL.revokeObjectURL(url);}
}
