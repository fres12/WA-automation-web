function o(){d()}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",o):o();async function d(){const a=document.getElementById("automationsBody");try{const e=await fetch("/api/automations"),t=await e.json();if(e.status===401){window.location.assign("/login.html");return}t.success?i(t.data):a.innerHTML=`<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Gagal memuat data: ${t.error}</td></tr>`}catch(e){console.error(e),a.innerHTML='<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Gagal mengambil data automation. Pastikan backend sedang berjalan.</td></tr>'}}function s(a){if(!a)return"-";const e=new Date(a);return new Intl.DateTimeFormat("id-ID",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(e)}function i(a){const e=document.getElementById("automationsBody");if(a.length===0){e.innerHTML='<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">Belum ada automation. <a href="/" class="text-blue-600 hover:underline">Buat sekarang</a></td></tr>';return}e.innerHTML="",a.forEach(t=>{const n=t.status==="active"?"bg-green-100 text-green-800":"bg-gray-100 text-gray-800",r=document.createElement("tr");r.className="hover:bg-gray-50 transition-colors",r.innerHTML=`
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="text-sm font-medium text-gray-900">${t.nama_automation}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${n}">
          ${t.status||"draft"}
        </span>
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        ${s(t.created_at)}
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        ${s(t.last_run_date)}
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <button type="button" class="text-blue-600 hover:text-blue-900 font-medium btn-read" data-id="${t.id}">Read Detail</button>
      </td>
    `,e.appendChild(r)}),document.querySelectorAll(".btn-read").forEach(t=>{t.addEventListener("click",n=>{window.location.assign("/detail?id="+n.target.getAttribute("data-id"))})})}
