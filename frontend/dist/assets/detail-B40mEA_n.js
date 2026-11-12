async function o(){const e=new URLSearchParams(window.location.search).get("id");if(!e){document.getElementById("detailContent").innerHTML='<p class="text-red-500 text-center py-8">ID Automation tidak ditemukan.</p>';return}await c(e)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",o):o();async function c(t){const e=document.getElementById("detailContent"),a=document.getElementById("btnEdit"),s=document.getElementById("btnStatus"),n=document.getElementById("btnRemove");a.href=`/?edit=${t}`,s.addEventListener("click",()=>g(t,s)),n.addEventListener("click",()=>u(t,n));try{const i=await(await fetch(`/api/automations/${t}`)).json();i.success?(p(i.data),d(s,i.data.status)):e.innerHTML=`<p class="text-red-500 text-center py-8">Gagal memuat detail: ${i.error}</p>`}catch(r){console.error(r),e.innerHTML='<p class="text-red-500 text-center py-8">Terjadi kesalahan jaringan.</p>'}}function d(t,e){const a=e==="active";t.disabled=!1,t.textContent=a?"Deactive":"Active",t.className=a?"inline-flex items-center px-4 py-2 border border-yellow-300 rounded-md shadow-sm text-sm font-medium text-yellow-700 bg-white hover:bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500":"inline-flex items-center px-4 py-2 border border-green-300 rounded-md shadow-sm text-sm font-medium text-green-700 bg-white hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500";const s=document.getElementById("statusValue");s&&(s.textContent=e,s.className=`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${a?"bg-green-100 text-green-800":"bg-gray-100 text-gray-800"}`)}async function g(t,e){const a=e.textContent==="Deactive"?"inactive":"active";e.disabled=!0,e.textContent="Memperbarui...";try{const s=await fetch(`/api/automations/${t}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:a})}),n=await s.json();if(!s.ok||!n.success)throw new Error(n.error||"Gagal memperbarui status automation");d(e,n.status)}catch(s){console.error(s),e.disabled=!1,d(e,a==="inactive"?"active":"inactive"),window.alert(s.message||"Terjadi kesalahan saat memperbarui status automation.")}}async function u(t,e){if(window.confirm("Hapus automation ini? Data yang sudah dihapus tidak dapat dikembalikan.")){e.disabled=!0,e.textContent="Menghapus...";try{const a=await fetch(`/api/automations/${t}`,{method:"DELETE"}),s=await a.json();if(!a.ok||!s.success)throw new Error(s.error||"Gagal menghapus automation");window.location.assign("/dashboard")}catch(a){console.error(a),e.disabled=!1,e.textContent="Remove",window.alert(a.message||"Terjadi kesalahan saat menghapus automation.")}}}function p(t){const e=document.getElementById("detailContent"),a=t.status||"inactive",s=a==="active"?"bg-green-100 text-green-800":"bg-gray-100 text-gray-800";let n="";t.request_sheets&&t.request_sheets.length>0?(n='<ul class="mt-2 border border-gray-200 rounded-md divide-y divide-gray-200">',t.request_sheets.forEach(i=>{const l=i.sheet_tables?i.sheet_tables.map(m=>m.cell_range).join(", "):"";n+=`
        <li class="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
          <div class="w-0 flex-1 flex items-center">
            <svg class="flex-shrink-0 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
            </svg>
            <span class="ml-2 flex-1 w-0 truncate">Sheet: <span class="font-medium text-gray-900">${i.sheet_name}</span></span>
          </div>
          <div class="ml-4 flex-shrink-0 text-gray-500">
            Ranges: ${l||"-"}
          </div>
        </li>
      `}),n+="</ul>"):n='<p class="text-sm text-gray-500 italic">Tidak ada konfigurasi sheet.</p>';let r="";t.request_groups&&t.request_groups.length>0?(r='<ul class="mt-2 flex flex-wrap gap-2">',t.request_groups.forEach(i=>{i.wa_groups&&(r+=`<li class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">${i.wa_groups.group_name}</li>`)}),r+="</ul>"):r='<p class="text-sm text-gray-500 italic">Tidak ada grup terpilih.</p>',e.innerHTML=`
    <dl class="sm:divide-y sm:divide-gray-200">
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Nama Automation</dt>
        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${t.nama_automation}</dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Status</dt>
        <dd class="mt-1 sm:mt-0 sm:col-span-2">
          <span id="statusValue" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${s}">${a}</span>
        </dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Link Spreadsheet</dt>
        <dd class="mt-1 text-sm text-blue-600 truncate sm:mt-0 sm:col-span-2">
          <a href="${t.link}" target="_blank" class="hover:underline" title="${t.link}">Buka Tautan Spreadsheet &nearr;</a>
        </dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Jam Blast</dt>
        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${t.jam_blast||"-"}</dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Tanggal Blast</dt>
        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${t.tanggal_blast||"-"}</dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Caption / Pesan</dt>
        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 whitespace-pre-wrap bg-gray-50 p-3 rounded-md border border-gray-200">${t.caption||'<span class="text-gray-400 italic">Tanpa caption</span>'}</dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Grup Tujuan</dt>
        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
          ${r}
        </dd>
      </div>
      <div class="py-3 sm:py-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500 mb-2">Konfigurasi Data (Sheets)</dt>
        <dd class="mt-1 text-sm text-gray-900">
          ${n}
        </dd>
      </div>
    </dl>
  `}
