import type { PassengerBookingShare } from "../../api";

/** Browser text clipboard with a promise-backed item to preserve user activation. */
export async function copyBookingMessage(
  loader:()=>Promise<PassengerBookingShare>
):Promise<{status:"copied"|"manual";share:PassengerBookingShare}> {
  const snapshot=loader(); // a single authenticated request, never a stale visible URL
  if(navigator.clipboard?.write && typeof ClipboardItem!=="undefined"){
    let item:ClipboardItem|undefined;
    try {
      item=new ClipboardItem({
        "text/plain":snapshot.then(data=>new Blob([data.message],{type:"text/plain"}))
      });
    }catch{ /* some browsers do not accept promise-backed ClipboardItem */ }
    if(item) {
      try {
        // Called synchronously before awaiting any network request.
        await navigator.clipboard.write([item]);
        return {status:"copied",share:await snapshot};
      } catch {
        return {status:"manual",share:await snapshot};
      }
    }
  }
  const share=await snapshot;
  if(navigator.clipboard?.writeText){
    try {await navigator.clipboard.writeText(share.message);
      return {status:"copied",share};}
    catch{ /* expose manual selection fallback */ }
  }
  return {status:"manual",share};
}
