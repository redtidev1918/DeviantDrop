import { fetchPublicMedia } from '../preview/server.js';

// Optional publishing is bounded: no GIF/video conversion and no unbounded buffering.
export async function publishArtwork(env, id, media, sourceUrl, failed = false) {
  const client=env.telepress;
  if(!client?.enabled())return null;
  const items=[media,...(media.extras||[])];
  if(!items.every(i=>i.kind==='photo'))return null;
  if(!(failed ? client.shouldFallback() : client.shouldPublishLargeGallery(items.length)))return null;
  try{
    const cached=await client.getCachedUrl(id);
    if(cached)return cached;
    // ponytail: cap optional publication at 50 photos / 50 MiB; stream to TelePress if larger galleries matter.
    if(items.length>50)return null;
    // Manifest path first: send tiny MediaReference[] so TelePress fetches remotely and DeviantDrop never buffers MiB into memory.
    const refs = items.map((item) => ({ assetId: item.assetId, kind: item.kind, sourceUrl: item.url }));
    const manifestResult = await client.publishGallery({ deviationId: id, title: media.title, media: refs, link: sourceUrl });
    if (manifestResult?.url) return manifestResult.url;
    // Fallback: TelePress older/without media support -> legacy binary multipart.
    const files=[];let total=0;
    for(const item of items){
      const r=await fetchPublicMedia(item.url);
      if(!r.ok){await r.body?.cancel();return null;}
      const chunks=[];const reader=r.body.getReader();
      for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>50*1024*1024){await reader.cancel();return null;}chunks.push(value);}
      const data=await new Blob(chunks).arrayBuffer();
      files.push({data,contentType:r.headers.get('Content-Type')||'image/jpeg',filename:`image-${files.length+1}.jpg`});
    }
    const result=await client.publishGallery({deviationId:id,title:media.title,files,link:sourceUrl});
    return result?.url||null;
  }catch{return null;}
}
