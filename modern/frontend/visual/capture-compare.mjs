/**
 * Real-browser legacy-vs-React screenshot comparison.
 *
 * This never creates a "passing" baseline from the modern app.
 * You must provide BOTH live URLs with identical test fixture, same dates
 * and authorized, separately obtained browser login state.
 *
 * Example (from modern/frontend):
 *  LEGACY_URL=http://localhost:3000/#/gds/routes MODERN_URL=http://localhost:5173 \
 *   MODERN_STATE_FILE=... LEGACY_STATE_FILE=... \
 *   VISUAL_NAME=routes node visual/capture-compare.mjs
 */
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";

const legacyUrl = process.env.LEGACY_URL;
const modernUrl = process.env.MODERN_URL;
if (!legacyUrl || !modernUrl) {
  console.error("Provide LEGACY_URL and MODERN_URL. A screenshot diff without the original is invalid.");
  process.exit(2);
}
const name = (process.env.VISUAL_NAME || "route")
  .replace(/[^a-z0-9_-]/gi, "-").slice(0, 64);
const width = Number(process.env.VISUAL_WIDTH || 1440);
const height = Number(process.env.VISUAL_HEIGHT || 900);
if (!Number.isInteger(width) || width < 320 || width > 3840 ||
    !Number.isInteger(height) || height < 320 || height > 2160)
  throw Error("Invalid viewport");

const folder = resolve("visual-output", name+"-"+width+"x"+height);
await mkdir(folder,{recursive:true});
const browser = await chromium.launch({ headless:true });
async function capture(url, stateFile, label, selector) {
  const context = await browser.newContext({
    viewport:{width,height},
    deviceScaleFactor:1,
    ...(stateFile?{storageState:resolve(stateFile)}:{})
  });
  try {
    const page = await context.newPage();
    page.on("pageerror",e=>console.error(label+" page error: "+e.message));
    await page.goto(url,{waitUntil:"domcontentloaded"});
    if(selector)await page.locator(selector).waitFor({state:"visible",timeout:10000});
    else await page.waitForLoadState("networkidle",{timeout:10000}).catch(()=>{});
    // Respect a caller-supplied navigation, auth state and data fixture.
    // This is a screenshot of what the browser ACTUALLY rendered.
    const output=resolve(folder,label+".png");
    const png=await page.screenshot({path:output,fullPage:false,animations:"disabled"});
    return {file:output,png,url};
  } finally {await context.close();}
}
let oldImage, newImage;
try {
  oldImage=await capture(legacyUrl,process.env.LEGACY_STATE_FILE,"legacy",process.env.LEGACY_SELECTOR);
  newImage=await capture(modernUrl,process.env.MODERN_STATE_FILE,"react",process.env.MODERN_SELECTOR);
} finally {await browser.close();}

const diffBrowser=await chromium.launch({headless:true});
let result;
try {
  const page=await diffBrowser.newPage({viewport:{width,height}});
  await page.goto("about:blank");
  result=await page.evaluate(async({old,newer,width,height})=>{
    const img=async(src)=>{
      const el=new Image();
      await new Promise((yes,no)=>{el.onload=yes;el.onerror=()=>no(Error("Bad PNG"));el.src=src;});
      return el;
    };
    const original=await img(old),modified=await img(newer);
    const make=()=>{const c=document.createElement("canvas");c.width=width;c.height=height;return c;};
    const left=make(),right=make(),canvas=make();
    const lctx=left.getContext("2d",{willReadFrequently:true}),rctx=right.getContext("2d",{willReadFrequently:true});
    const dctx=canvas.getContext("2d",{willReadFrequently:true});
    lctx.drawImage(original,0,0);
    rctx.drawImage(modified,0,0);
    const a=lctx.getImageData(0,0,width,height).data,b=rctx.getImageData(0,0,width,height).data;
    const imgData=dctx.createImageData(width,height);
    let mismatches=0,meanError=0;
    const threshold=Number("24");
    for(let i=0;i<a.length;i+=4){
      const delta=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));
      meanError+=delta;
      if(delta>threshold){mismatches++;imgData.data[i]=255;imgData.data[i+1]=48;imgData.data[i+2]=66;imgData.data[i+3]=255;}
      else{const base=Math.round((a[i]+a[i+1]+a[i+2])/3);imgData.data[i]=base;imgData.data[i+1]=base;imgData.data[i+2]=base;imgData.data[i+3]=255;}
    }
    dctx.putImageData(imgData,0,0);
    return {comparison:"actual legacy to React",pixels:width*height,
      mismatchedPixels:mismatches,percentMismatched:Math.round(mismatches/(width*height)*10000)/100,
      meanMaxChannelDifference:Math.round(meanError/(width*height)*100)/100,
      diffPng:canvas.toDataURL("image/png").split(",")[1],
      oldDimensions:[original.naturalWidth,original.naturalHeight],
      newDimensions:[modified.naturalWidth,modified.naturalHeight]};
  },{
    old:"data:image/png;base64,"+oldImage.png.toString("base64"),
    newer:"data:image/png;base64,"+newImage.png.toString("base64"),
    width,height
  });
}finally{await diffBrowser.close();}
const {diffPng,...audit}=result;
await writeFile(resolve(folder,"diff.png"),Buffer.from(diffPng,"base64"));
await writeFile(resolve(folder,"comparison.json"),JSON.stringify({
  ...audit,
  name,legacyUrl,modernUrl,
  note:"No automatic screenshot fidelity certification: review reference data state, fonts, overlays and responsive states."
},null,2));
console.log(JSON.stringify({output:folder,...audit},null,2));
if(Number(process.env.MAX_DIFF_PERCENT || "100")<audit.percentMismatched)process.exitCode=1;
