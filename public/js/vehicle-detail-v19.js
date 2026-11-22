(function(){
'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const P={
 arrow:'M19 12H5m7-7-7 7 7 7',
 clipboard:'M8 4h8M9 2h6v4H9zM6 4H4v18h16V4h-2M8 11h8M8 16h8',
 file:'M6 2h8l5 5v15H6zM14 2v6h5M9 12h7m-7 4h7',
 wrench:'M14 6a5 5 0 0 0-6 6l-5 5a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-4 1-3-3 1-4Z',
 archive:'M3 4h18v4H3zM5 8v13h14V8M9 12h6',
 globe:'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-10 10h20M12 2c-5 6-5 14 0 20m0-20c5 6 5 14 0 20',
 lock:'M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3',
 upload:'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
 external:'M13 4h7v7m0-7-10 10M18 14v6H4V6h6',
 trash:'M3 6h18M8 6V4h8v2m-9 0 1 15h8l1-15M10 10v7m4-7v7',
 tag:'M3 3h10l8 9-9 9-9-8Z M8 8h.01',
 plus:'M12 5v14M5 12h14',
 x:'M18 6 6 18M6 6l12 12',
 phone:'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.3 10a16 16 0 0 0 6.7 6.7l1.6-1.7a2 2 0 0 1 1.7-.6l3 .5a2 2 0 0 1 1.7 2Z',
 gauge:'M5 19a9 9 0 1 1 14 0M12 12l4-5',
 check:'M4 12l5 5L20 6',
 calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
 chevron:'m6 9 6 6 6-6',
 edit:'M12 20h9M16 3a2 2 0 0 1 3 3L7 18l-4 1 1-4L16 3Z',
 save:'M4 3h13l4 4v14H3V3h1Zm4 0v6h9V3M7 21v-9h10v9',
 alert:'m12 3 10 18H2L12 3Zm0 7v4m0 3h.01',
 rotate:'M20 11a8 8 0 1 0-2 6M20 4v7h-7',
 eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'
};
const ic=(k,n=20)=>`<svg class="vd19-icon" width="${n}" height="${n}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><path d="${P[k]||P.file}"/></svg>`;
const DOCS=[['RC','Registration Certificate (RC)'],['INSURANCE','Insurance'],['PUC','Pollution Under Control (PUC)'],['FITNESS','Fitness Certificate'],['AITP_FORM_2','AITP Form 2'],['AITP_FORM_3','AITP Form 3'],['VLTD','VLTD'],['FDSS','FDSS']];
const num=v=>v===null||v===undefined||v===''?'—':Number(v).toLocaleString('en-IN',{maximumFractionDigits:1});
const dmy=v=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v.split('-').reverse().join('-'):'—';
const htmlText=(v,placeholder='—')=>v!==null&&v!==undefined&&String(v).trim()?E(v):`<span class="vd19-placeholder">${E(placeholder)}</span>`;
const staffBool=x=>Boolean(x);
const err=e=>window.G?.err?G.err(e):console.error(e);
const fileToData=file=>new Promise((resolve,reject)=>{
  const fr=new FileReader();
  fr.onload=()=>resolve(fr.result);fr.onerror=()=>reject(new Error('Unable to read selected file'));
  fr.readAsDataURL(file);
});
const compare=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function renderDetails(s){
  const v=s.draft,edit=s.mode==='edit',opts=s.data.coaches||[];
  const field=(label,key,placeholder='',type='text',required=false,options=null)=>{
    let val=v[key]??'',content;
    if(!edit)content=htmlText(options?opts.find(c=>String(c.id)===String(val))?.name||val:val,placeholder||'—');
    else if(options)content=`<select name="${key}" data-vd19-field="${key}" ${required?'required':''}>${options.map(c=>`<option value="${E(c.id)}" ${String(c.id)===String(val)?'selected':''}>${E(c.name)}</option>`).join('')}</select>`;
    else content=`<input data-vd19-field="${key}" name="${key}" ${required?'required':''} type="${type}" ${type==='number'?'min="0" step="any"':''} value="${E(val)}" placeholder="${E(placeholder)}">`;
    return `<div class="vd19-field-row"><label for="vd19-${key}">${E(label)}${required?'<em> *</em>':''}</label><div class="vd19-value">${content}</div></div>`;
  };
  const coaches=opts.map(c=>({id:c.id,name:c.name}));if(!coaches.length)coaches.push({id:v.coach_template_id,name:v.coach||'Unassigned coach'});
  const top=field('Coach Type','coach_template_id','Choose coach type','text',true,coaches)+
    field('Registration Number','registration_number','Enter registration','text',true)+
    field('Vehicle Number (Fleet ID)','vehicle_number','e.g., FLEET-001, BUS-42')+
    field('📞 Mobile Number','phone_number','e.g., 9113209461','tel');
  const segment=(label,key,choices)=>`<div class="vd19-field-row vd19-segment-row"><span>${E(label)}</span><div class="vd19-segments">${choices.concat(!choices.some(([value])=>value===v[key])&&v[key]?[ [v[key],v[key][0].toUpperCase()+v[key].slice(1)] ]:[]).map(([value,text])=>`<button type="button" data-vd19-option="${key}" data-value="${E(value)}" ${!edit?'disabled':''} class="${v[key]===value?'selected':''}">${E(text)}</button>`).join('')}</div></div>`;
  const toggled=(label,key)=>`<div class="vd19-field-row vd19-toggle-row"><span>${E(label)}</span><label class="vd19-switch"><input type="checkbox" data-vd19-flag="${key}" ${v[key]?'checked':''} ${!edit?'disabled':''} aria-label="${E(label)}"><i></i></label></div>`;
  const gps=toggled('GPS Enabled','gps_enabled')+field('GPS Device ID','gps_device_id','e.g., GPS-12345')+field('GPS Provider','gps_provider','e.g., Intouchgps, Fleetx, etc.')+
    toggled('DMS Enabled','dms_enabled')+field('DMS Device ID','dms_device_id','e.g., DMS-12345')+
    field('DMS Provider','dms_provider','e.g., Mobileye, Seeing Machines, etc.');
  const specs=field('Chassis Number','chassis_number','e.g., MBZS...')+field('Engine Number','engine_number','e.g., ENG...')+
    field('Model Name','model_name','e.g., Bharat Benz 2623C')+
    field('Manufacture Year','manufacture_year','e.g., 2022','number')+
    field('Purchased Date','purchased_date',edit?'dd-mm-yyyy':'—','date')+
    field('Odometer Reading (km)','odometer_reading','e.g., 125000.5','number');
  const tags=Object.entries(v.tags||{}).map(([k,val])=>`<span class="vd19-tag">${E(k)} = ${E(val)}${edit?`<button data-vd19-tag-remove="${E(k)}" title="Remove tag">${ic('x',13)}</button>`:''}</span>`).join('')||'<div class="vd19-tag-empty">No tags</div>';
  return `<div class="vd19-details-grid">
    <div class="vd19-col"><h4>VEHICLE DETAILS</h4><div class="vd19-card">${top}</div>
      <div class="vd19-card vd19-segment-card">${segment('Vehicle Ownership','ownership_type',[['permanent','Permanent'],['temporary','Temporary']])}
      ${segment('Vehicle Type','vehicle_role',[['main','Main Bus'],['pickup_van','Pickup Bus']])}</div>
      <p class="vd19-help">Own fleet. Fleet utilization counts it every day. Runs the trip. Counted in fleet utilization.</p>
      <h4>GPS & DRIVER MONITORING</h4><div class="vd19-card">${gps}</div>
      <p class="vd19-help">Enable GPS for real-time vehicle tracking and DMS for driver safety monitoring. Configuration alone does not establish a live GPS connection.</p>
    </div>
    <div class="vd19-col"><h4>VEHICLE SPECIFICATIONS</h4><div class="vd19-card">${specs}</div>
      <h4>NOTES</h4><div class="vd19-card vd19-notes">${edit?`<textarea data-vd19-field="notes" name="notes" placeholder="Any additional notes or remarks about this vehicle...">${E(v.notes||'')}</textarea>`:`<div class="vd19-notes-read">${htmlText(v.notes,'Any additional notes or remarks about this vehicle...')}</div>`}</div>
      <div class="vd19-card vd19-tags"><div class="vd19-tag-head">${ic('tag',19)} <b>Tags</b></div><div class="vd19-tag-list">${tags}</div>
      ${edit?`<div class="vd19-tag-form"><input name="tag_name" placeholder="Name, e.g. corridor" maxlength="60"><b>=</b><input name="tag_value" placeholder="Value, e.g. mumbai" maxlength="120"><button data-vd19-tag-add type="button">${ic('plus',17)} Add</button></div>`:''}
      <p>Labels like depot = mangaluru or corridor = mumbai — the same tags you use on routes and people.</p></div>
    </div></div>
    ${edit?`<div class="vd19-savebar"><span data-vd19-dirty-msg>${s.dirty?'Unsaved changes':'Changes apply to this vehicle only'}</span><button type="button" data-vd19-save ${!s.dirty?'disabled':''}>${ic('save',18)} Save Vehicle</button></div>`:''}`;
}
function renderDocuments(s){
  const map=new Map(s.data.documents.map(d=>[d.document_type,d]));
  const more=s.data.documents.filter(d=>!DOCS.some(([k])=>k===d.document_type)).map(d=>[d.document_type,d.document_name||d.document_type]);
  const list=[...DOCS,...more];
  return `<section class="vd19-single"><h4>VEHICLE DOCUMENTS</h4><div class="vd19-document-card">
    ${list.map(([type,label])=>{
      const doc=map.get(type),isPublic=doc?.visibility==='public',active=s.mode==='edit',exp=doc?.expiry_date;
      return `<article class="vd19-document-row"><div class="vd19-doc-left"><span class="vd19-file-icon">${ic('file',19)}</span>
        <div><b>${E(label)}</b><div class="vd19-doc-links">
        ${doc?.has_file?`<button data-vd19-doc-open="${doc.id}">Open document ${ic('external',15)}</button>`:
          `<span class="vd19-no-file">No file uploaded</span>`}
        ${active?`<div class="vd19-doc-editlinks"><button data-vd19-doc-upload="${E(type)}">${ic('upload',15)} ${doc?'Replace':'Upload'}</button>
          ${doc?`<button data-vd19-doc-archive="${doc.id}">${ic('archive',15)} Archive</button>
          <button class="danger" data-vd19-doc-delete="${doc.id}">${ic('trash',15)} Delete</button>`:''}</div>`:''}
        </div></div></div><div class="vd19-doc-right">
         <div class="vd19-visibility"><button type="button" data-vd19-visibility="${doc?.id||''}" data-value="public" ${!active||!doc?'disabled':''} class="${isPublic?'active':''}">${ic('globe',18)} Public</button>
          <button type="button" data-vd19-visibility="${doc?.id||''}" data-value="private" ${!active||!doc?'disabled':''} class="${!isPublic?'active private':''}">${ic('lock',18)} Private</button></div>
         <div class="vd19-expiry"><small>Expiry Date</small>${active&&doc?`<input data-vd19-expiry="${doc.id}" type="date" aria-label="Expiry date for ${E(label)}" value="${E(exp||'')}">`:`<span>${dmy(exp)}</span>`}</div>
        </div></article>`;
    }).join('')}</div><p class="vd19-doc-legend">${ic('globe',16)} Public — drivers and crew on this bus's trips can view it &nbsp; ${ic('lock',16)} Private — only people with Vehicles access</p></section>`;
}
function renderMaintenance(s){
  const m=s.data.service||{},items=s.data.maintenance||[];
  const edit=s.mode==='edit',status=m.status||'Inactive';
  return `<section class="vd19-single"><h4>SERVICE SCHEDULE</h4><div class="vd19-card vd19-service-card">
    <div class="vd19-field-row"><span>Last Service Date</span><b>${dmy(m.last_service_date)}</b></div>
    <div class="vd19-field-row"><span>Next Service Date</span><b>${dmy(m.next_service_date)}</b></div>
    <div class="vd19-field-row"><span>Status</span><b class="vd19-service-status ${status==='Service due'?'due':''}">● ${E(status)}</b></div>
    ${m.next_service_km!==null&&m.next_service_km!==undefined?`<div class="vd19-field-row"><span>Service due at</span><b>${num(m.next_service_km)} km</b></div>`:''}</div>
    <div class="vd19-maint-head"><div><h4>MAINTENANCE RECORDS & REMINDERS</h4>
      <p>Service bills, job cards and the next service due by date or km. These save straight away.</p>
      <span class="vd19-odo">${ic('gauge',19)} ${num(m.odometer_reading)} km</span></div>
      ${edit?`<button type="button" data-vd19-maint-add>${ic('plus',18)} Add Maintenance</button>`:''}</div>
    ${items.length?`<div class="vd19-maint-list">${items.map(r=>`<article class="vd19-maint-record"><div class="vd19-maint-summary"><span class="vd19-tool-icon">${ic('wrench',23)}</span><div>
      <b>${E(r.label)}</b><p>${E(r.type||'Service')} · ${dmy(r.service_date)} ${r.odometer_km!=null?'· '+num(r.odometer_km)+' km':''}</p>
      <small>${r.next_due_date?'Due '+dmy(r.next_due_date):''} ${r.next_due_km!=null?'· '+num(r.next_due_km)+' km':''} ${r.cost?'· ₹'+num(r.cost):''}</small>
      ${r.notes?`<p>${E(r.notes)}</p>`:''}</div></div><div class="vd19-maint-actions">
      ${r.has_file?`<button data-vd19-maint-file="${r.id}">${ic('external',16)} ${E(r.file_name||'Job card')}</button>`:''}
      ${edit?`<button data-vd19-maint-edit="${r.id}">${ic('edit',17)} Edit</button><button data-vd19-maint-archive="${r.id}">${ic('archive',17)} Archive</button>`:''}</div></article>`).join('')}</div>`:
      `<div class="vd19-empty">${ic('wrench',32)}<span>No maintenance records yet.</span></div>`}
    </section>`;
}
function renderArchive(s){
  const list=s.data.archive||[];
  const docCount=list.filter(x=>x.kind==='document').length,maintCount=list.length-docCount;
  const filtered=list.filter(x=>s.archiveFilter==='all'||(s.archiveFilter==='documents'?x.kind==='document':x.kind==='maintenance'));
  return `<section class="vd19-archive-section"><header><span class="vd19-archive-symbol">${ic('archive',23)}</span><div><b>Archive</b>
    <p>Old and replaced documents and archived maintenance records, newest first. Drivers and crew never see these.</p></div></header>
    <div class="vd19-archive-filters">${[['all','All',list.length],['documents','Documents',docCount],['maintenance','Maintenance',maintCount]].map(([key,title,n])=>`<button data-vd19-archive-filter="${key}" class="${s.archiveFilter===key?'active':''}">${title} ${n}</button>`).join('')}</div>
    ${filtered.length?`<div class="vd19-archive-list">${filtered.map(x=>`<article class="vd19-archive-entry">
     <span>${ic(x.kind==='document'?'file':'wrench',19)}</span><div><strong>${E(x.document_name||x.label||x.document_type)}</strong>
     <small>${x.kind==='document'?'Document':'Maintenance'} · Archived ${x.archived_at?new Date(x.archived_at).toLocaleDateString('en-IN'):'—'} ${x.archive_reason?'· '+E(x.archive_reason):''}</small></div>
     ${x.kind==='document'&&x.has_file&&s.mode==='edit'?`<button data-vd19-doc-open="${x.id}">Open ${ic('external',15)}</button>`:''}</article>`).join('')}</div>`:
    `<div class="vd19-empty vd19-archive-empty">${ic('archive',34)}<span>Nothing archived yet. Archived documents and files you replace appear here.</span></div>`}</section>`;
}
function render(s,root){
  const registration=E(s.draft.registration_number||s.data.vehicle.registration_number);
  const tabs=[['details','Details','clipboard'],['documents','Documents','file'],['maintenance','Maintenance','wrench'],['archive','Archive','archive']];
  root.innerHTML=`<div class="vd19-workspace">
    <div class="vd19-heading"><button data-vd19-back title="Back to vehicles">${ic('arrow',25)}</button><div><h2>${s.mode==='edit'?'Edit Vehicle':'View Vehicle Details'}</h2><small>${registration}</small></div>
      <div class="vd19-head-actions">${s.mode==='view'&&s.canModify?`<button data-vd19-mode="edit" class="vd19-head-edit">${ic('edit',17)} Edit</button>`:s.mode==='edit'?`<button data-vd19-mode="view" class="vd19-head-view">${ic('eye',17)} View</button>`:''}</div></div>
    <div class="vd19-content"><nav class="vd19-tabs" role="tablist" aria-label="Vehicle details tabs">${tabs.map(([key,label,iconName])=>`<button type="button" role="tab" aria-selected="${s.tab===key}" data-vd19-tab="${key}" class="${s.tab===key?'active':''}">${ic(iconName,20)} ${label}</button>`).join('')}</nav>
    <div class="vd19-section" role="tabpanel">${s.tab==='details'?renderDetails(s):s.tab==='documents'?renderDocuments(s):s.tab==='maintenance'?renderMaintenance(s):renderArchive(s)}</div></div></div>`;
}
async function open({id,mode='view',host,onDone}){
  if(!host)throw new Error('Missing vehicle page');
  const root=document.createElement('div');root.className='vd19-root';host.replaceChildren(root);
  const s={id,mode,host,onDone,tab:'details',archiveFilter:'all',data:null,draft:null,original:null,dirty:false,canModify:can('fleet.modify'),canDocs:can('fleet.documents')};
  const reload=async({preserveDraft=false}={})=>{
    const previous=preserveDraft?s.draft:null;
    s.data=await G.get('/vehicles/'+encodeURIComponent(s.id)+'/detail-v19');
    s.draft=previous||structuredClone(s.data.vehicle);
    s.draft.tags={...(s.draft.tags||{})};
    s.original=structuredClone(s.data.vehicle);
    s.dirty=previous? !compare(s.draft,s.original):false;
    render(s,root);
  };
  const confirmDiscard=async()=>!s.dirty||Boolean(await G.confirm('Discard unsaved vehicle changes?',{danger:1,ok:'Discard'}));
  const leave=async()=>{if(!await confirmDiscard())return;root.remove();if(onDone)await onDone();};
  const saveDetails=async()=>{
    if(s.mode!=='edit'||!s.dirty)return;
    if(!s.draft.registration_number?.trim()||!s.draft.coach_template_id){G.toast('Coach Type and Registration Number are required','warn');return;}
    const body={};
    for(const k of ['registration_number','coach_template_id','vehicle_number','phone_number','ownership_type','vehicle_role','gps_enabled','gps_device_id','gps_provider','dms_enabled','dms_device_id','dms_provider','chassis_number','engine_number','model_name','manufacture_year','purchased_date','odometer_reading','notes','tags'])body[k]=s.draft[k]??(k==='tags'?{}:'');
    await G.put('/vehicles/'+encodeURIComponent(s.id)+'/detail-v19',body);
    s.dirty=false;G.toast('Vehicle details saved','ok');await reload();
  };
  function refreshInputDirty(){
    s.dirty=!compare(s.draft,s.original);
    const save=root.querySelector('[data-vd19-save]');if(save)save.disabled=!s.dirty;
    const label=root.querySelector('[data-vd19-dirty-msg]');if(label)label.textContent=s.dirty?'Unsaved changes':'Changes apply to this vehicle only';
  }
  const refresh=async()=>{await reload();};
  const fileOpen=async(url,name)=>{
    const token=localStorage.getItem('token');
    const headers={Authorization:'Bearer '+token};if(G.viewAs)headers['x-view-as']=String(G.viewAs);
    const win=window.open('about:blank','_blank');if(win)win.opener=null;
    try{
      const r=await fetch('/api'+url,{headers});
      if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.message||'Unable to open file');}
      const blob=await r.blob(),obj=URL.createObjectURL(blob);
      if(win){win.location.href=obj;setTimeout(()=>URL.revokeObjectURL(obj),120000);}
      else{const a=document.createElement('a');a.href=obj;a.download=name||'document';a.click();setTimeout(()=>URL.revokeObjectURL(obj),120000);}
    }catch(e){if(win)win.close();throw e;}
  };
  function uploadDocument(type){
    if(!s.canDocs)return G.toast('Document permission required','bad');
    const existing=s.data.documents.find(d=>d.document_type===type);
    const label=DOCS.find(([k])=>k===type)?.[1]||type;
    const m=G.modal({title:`${existing?'Replace':'Upload'} ${E(label)}`,size:'lg',
      body:`<div class="vd19-upload-form"><p>${existing?'The previous document is retained in Archive automatically.':'Upload a document for this vehicle.'}</p>
       <label>Document file (PDF, PNG, JPEG, WebP; max 5 MB)<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" required></label>
       <label>Expiry Date<input type="date" name="expiry_date" value="${E(existing?.expiry_date||'')}"></label>
       <label>Visibility<select name="visibility"><option value="public" ${existing?.visibility==='public'?'selected':''}>Public</option><option value="private" ${existing?.visibility!=='public'?'selected':''}>Private</option></select></label>
       <label>Document number<input name="document_number" value="${E(existing?.document_number||'')}" maxlength="80"></label></div>`,
      foot:'<button class="btn" data-vd19-cancel>Cancel</button><button class="btn p" data-vd19-submit>Save document</button>'});
    m.$('[data-vd19-cancel]').onclick=()=>m.close();
    m.$('[data-vd19-submit]').onclick=async()=>{
      const file=m.$('[name=file]').files[0];
      if(!file||file.size>5*1024*1024||!['application/pdf','image/png','image/jpeg','image/webp'].includes(file.type)){G.toast('Select a PDF or image up to 5 MB','warn');return;}
      const button=m.$('[data-vd19-submit]');button.disabled=true;
      try{
        const payload={document_type:type,document_name:label,file_name:file.name,file_data:await fileToData(file),
          expiry_date:m.$('[name=expiry_date]').value||null,visibility:m.$('[name=visibility]').value,
          document_number:m.$('[name=document_number]').value};
        await G.post('/vehicles/'+s.id+'/documents-v19',payload);
        m.close();G.toast(existing?'Document replaced; previous file archived':'Document uploaded','ok');await refresh();
      }catch(ex){err(ex)}finally{button.disabled=false;}
    };
  }
  function maintenanceForm(record=null){
    if(!s.canModify)return;
    const m=G.modal({title:record?'Edit Maintenance':'Add Maintenance',size:'lg',
      body:`<div class="vd19-maint-form"><label>Description *<input name="label" required maxlength="120" value="${E(record?.label||'')}" placeholder="Service bill / job card"></label>
      <label>Type<select name="type">${[['service','Service'],['repair','Repair'],['inspection','Inspection'],['reminder','Reminder']].map(([k,l])=>`<option value="${k}" ${record?.type===k?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Service date<input type="date" name="service_date" value="${E(record?.service_date||'')}"></label>
      <label>Odometer (km)<input type="number" min="0" step=".1" name="odometer_km" value="${E(record?.odometer_km??'')}"></label>
      <label>Next service due date<input type="date" name="next_due_date" value="${E(record?.next_due_date||'')}"></label>
      <label>Next service due km<input type="number" min="0" step=".1" name="next_due_km" value="${E(record?.next_due_km??'')}"></label>
      <label>Cost (₹)<input type="number" min="0" step=".01" name="cost" value="${E(record?.cost??0)}"></label>
      <label>Job card or service bill (PDF/image up to 5 MB)<input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp"></label>
      <label class="full">Notes<textarea name="notes" rows="3">${E(record?.notes||'')}</textarea></label></div>`,
      foot:'<button class="btn" data-vd19-cancel>Cancel</button><button class="btn p" data-vd19-submit>Save Maintenance</button>'});
    m.$('[data-vd19-cancel]').onclick=()=>m.close();
    m.$('[data-vd19-submit]').onclick=async()=>{
      const label=m.$('[name=label]').value.trim();
      if(!label){G.toast('Maintenance description is required','warn');return;}
      const payload={label,type:m.$('[name=type]').value,service_date:m.$('[name=service_date]').value||null,
        odometer_km:m.$('[name=odometer_km]').value||null,next_due_date:m.$('[name=next_due_date]').value||null,
        next_due_km:m.$('[name=next_due_km]').value||null,cost:m.$('[name=cost]').value||0,notes:m.$('[name=notes]').value};
      const file=m.$('[name=file]').files[0];if(file){
        if(file.size>5*1024*1024||!['application/pdf','image/png','image/jpeg','image/webp'].includes(file.type)){G.toast('Invalid maintenance attachment','warn');return;}
        payload.file_name=file.name;payload.file_data=null;
      }
      const btn=m.$('[data-vd19-submit]');btn.disabled=true;
      try{
        if(file)payload.file_data=await fileToData(file);
        if(record)await G.put('/vehicles/'+s.id+'/maintenance-v19/'+record.id,payload);
        else await G.post('/vehicles/'+s.id+'/maintenance-v19',payload);
        m.close();G.toast('Maintenance saved','ok');await refresh();
      }catch(ex){err(ex)}finally{btn.disabled=false;}
    };
  }
  root.addEventListener('input',e=>{
    const x=e.target,k=x.dataset.vd19Field;
    if(k){s.draft[k]=x.value;refreshInputDirty();}
  });
  root.addEventListener('change',e=>{
    const x=e.target,k=x.dataset.vd19Flag;
    if(k){s.draft[k]=x.checked;refreshInputDirty();}
    const id=x.dataset.vd19Expiry;
    if(id){G.put('/vehicles/'+s.id+'/documents-v19/'+id,{expiry_date:x.value||null}).then(()=>refresh()).then(()=>G.toast('Expiry date saved','ok')).catch(err);}
  });
  root.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    const d=b.dataset;
    try{
      if('vd19Back' in d){await leave();return;}
      if('vd19Tab' in d){if(s.tab==='details'&&!await confirmDiscard())return;
        if(s.dirty){s.draft=structuredClone(s.original);s.dirty=false;}
        s.tab=d.vd19Tab;render(s,root);return;}
      if('vd19Mode' in d){if(!await confirmDiscard())return;s.mode=d.vd19Mode;await reload();return;}
      if('vd19Option' in d){if(s.mode!=='edit')return;s.draft[d.vd19Option]=d.value;refreshInputDirty();render(s,root);return;}
      if('vd19TagAdd' in d){
        const key=root.querySelector('[name=tag_name]')?.value.trim(),value=root.querySelector('[name=tag_value]')?.value.trim();
        if(!key||!value||key.length>60||value.length>120||['__proto__','constructor','prototype'].includes(key)){G.toast('Enter a valid tag name and value','warn');return;}
        s.draft.tags[key]=value;refreshInputDirty();render(s,root);return;
      }
      if('vd19TagRemove' in d){delete s.draft.tags[d.vd19TagRemove];refreshInputDirty();render(s,root);return;}
      if('vd19Save' in d){await saveDetails();return;}
      if('vd19DocUpload' in d){uploadDocument(d.vd19DocUpload);return;}
      if('vd19DocOpen' in d){
        const doc=[...s.data.documents,...s.data.archive].find(x=>String(x.id)===d.vd19DocOpen);
        if(doc)await fileOpen(`/vehicles/${s.id}/documents-v19/${doc.id}/file`,doc.file_name);return;
      }
      if('vd19Visibility' in d){if(!s.canDocs||!d.vd19Visibility)return;
        await G.put(`/vehicles/${s.id}/documents-v19/${d.vd19Visibility}`,{visibility:d.value});
        await refresh();G.toast('Document visibility updated','ok');return;
      }
      if('vd19DocArchive' in d){
        if(!await G.confirm('Archive this document? It will no longer appear under active documents.',{ok:'Archive'}))return;
        await G.post(`/vehicles/${s.id}/documents-v19/${d.vd19DocArchive}/archive`,{});await refresh();G.toast('Document archived','ok');return;
      }
      if('vd19DocDelete' in d){
        if(!await G.confirm('Permanently delete this document? This cannot be undone.',{ok:'Delete',danger:1}))return;
        await G.del(`/vehicles/${s.id}/documents-v19/${d.vd19DocDelete}`);await refresh();G.toast('Document deleted','ok');return;
      }
      if('vd19MaintAdd' in d){maintenanceForm();return;}
      if('vd19MaintEdit' in d){const r=s.data.maintenance.find(x=>String(x.id)===d.vd19MaintEdit);if(r)maintenanceForm(r);return;}
      if('vd19MaintArchive' in d){
        if(!await G.confirm('Archive this maintenance record?',{ok:'Archive'}))return;
        await G.post(`/vehicles/${s.id}/maintenance-v19/${d.vd19MaintArchive}/archive`,{});
        await refresh();G.toast('Maintenance record archived','ok');return;
      }
      if('vd19MaintFile' in d){
        const record=s.data.maintenance.find(x=>String(x.id)===d.vd19MaintFile);
        if(record)await fileOpen(`/vehicles/${s.id}/maintenance-v19/${record.id}/file`,record.file_name);return;
      }
      if('vd19ArchiveFilter' in d){s.archiveFilter=d.vd19ArchiveFilter;render(s,root);return;}
    }catch(ex){err(ex);}
  });
  await reload();
  root.scrollIntoView({behavior:'instant',block:'start'});
  return {refresh,close:leave};
}
window.VehicleDetailV19={open,DOCS};
})();
