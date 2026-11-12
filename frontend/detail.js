async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    document.getElementById('detailContent').innerHTML = '<p class="text-red-500 text-center py-8">ID Automation tidak ditemukan.</p>';
    return;
  }
  await fetchDetail(id);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function fetchDetail(id) {
  const content = document.getElementById('detailContent');
  const btnEdit = document.getElementById('btnEdit');
  const btnStatus = document.getElementById('btnStatus');
  const btnRemove = document.getElementById('btnRemove');
  
  btnEdit.href = `/form?edit=${id}`;
  btnStatus.addEventListener('click', () => toggleStatus(id, btnStatus));
  btnRemove.addEventListener('click', () => removeAutomation(id, btnRemove));

  try {
    const res = await fetch(`/api/automations/${id}`);
    const result = await res.json();
    
    if (result.success) {
      renderContent(result.data);
      updateStatusDisplay(btnStatus, result.data.status);
    } else {
      content.innerHTML = `<p class="text-red-500 text-center py-8">Gagal memuat detail: ${result.error}</p>`;
    }
  } catch (err) {
    console.error(err);
    content.innerHTML = `<p class="text-red-500 text-center py-8">Terjadi kesalahan jaringan.</p>`;
  }
}

function updateStatusDisplay(button, status) {
  const isActive = status === 'active';
  button.disabled = false;
  button.textContent = isActive ? 'Deactive' : 'Activate';
  button.className = isActive
    ? 'inline-flex items-center px-4 py-2 border border-[#fdc800] rounded-md shadow-sm text-sm font-medium text-white bg-[#fdc800] hover:bg-[#e5b200] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#fdc800]'
    : 'inline-flex items-center px-4 py-2 border border-green-300 rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500';

  const statusValue = document.getElementById('statusValue');
  if (statusValue) {
    statusValue.textContent = status;
    statusValue.className = `px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${isActive ? 'bg-green-100 text-green-800' : 'bg-[#fff4bf] text-[#9a7000]'}`;
  }
}

async function toggleStatus(id, button) {
  const nextStatus = button.textContent === 'Deactive' ? 'inactive' : 'active';
  button.disabled = true;
  button.textContent = 'Memperbarui...';

  try {
    const res = await fetch(`/api/automations/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    });
    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Gagal memperbarui status automation');
    }

    updateStatusDisplay(button, result.status);
  } catch (err) {
    console.error(err);
    button.disabled = false;
    updateStatusDisplay(button, nextStatus === 'inactive' ? 'active' : 'inactive');
    window.alert(err.message || 'Terjadi kesalahan saat memperbarui status automation.');
  }
}

async function removeAutomation(id, button) {
  if (!window.confirm('Hapus automation ini? Data yang sudah dihapus tidak dapat dikembalikan.')) return;

  button.disabled = true;
  button.textContent = 'Menghapus...';

  try {
    const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' });
    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Gagal menghapus automation');
    }

    window.location.assign('/dashboard');
  } catch (err) {
    console.error(err);
    button.disabled = false;
    button.textContent = 'Remove';
    window.alert(err.message || 'Terjadi kesalahan saat menghapus automation.');
  }
}

function renderContent(data) {
  const content = document.getElementById('detailContent');
  const status = data.status || 'inactive';
  const statusColor = status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  
  let sheetsHtml = '';
  if (data.request_sheets && data.request_sheets.length > 0) {
    sheetsHtml = `<ul class="mt-2 border border-gray-200 rounded-md divide-y divide-gray-200">`;
    data.request_sheets.forEach(sheet => {
      const ranges = sheet.sheet_tables ? sheet.sheet_tables.map(t => t.cell_range).join(', ') : '';
      sheetsHtml += `
        <li class="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
          <div class="w-0 flex-1 flex items-center">
            <svg class="flex-shrink-0 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
            </svg>
            <span class="ml-2 flex-1 w-0 truncate">Sheet: <span class="font-medium text-gray-900">${sheet.sheet_name}</span></span>
          </div>
          <div class="ml-4 flex-shrink-0 text-gray-500">
            Ranges: ${ranges || '-'}
          </div>
        </li>
      `;
    });
    sheetsHtml += `</ul>`;
  } else {
    sheetsHtml = `<p class="text-sm text-gray-500 italic">Tidak ada konfigurasi sheet.</p>`;
  }

  let groupsHtml = '';
  if (data.request_groups && data.request_groups.length > 0) {
    groupsHtml = `<ul class="mt-2 flex flex-wrap gap-2">`;
    data.request_groups.forEach(rg => {
      if (rg.wa_groups) {
        groupsHtml += `<li class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">${rg.wa_groups.group_name}</li>`;
      }
    });
    groupsHtml += `</ul>`;
  } else {
    groupsHtml = `<p class="text-sm text-gray-500 italic">Tidak ada grup terpilih.</p>`;
  }

  const rawBlastDays = (data.tanggal_blast || '').split(',').map((day) => day.trim()).filter(Boolean);
  const allDays = Array.from({ length: 31 }, (_, index) => String(index + 1));
  const displayBlastDays = rawBlastDays.length === 31 && allDays.every((day) => rawBlastDays.includes(day))
    ? 'Setiap hari'
    : rawBlastDays.length ? rawBlastDays.join(', ') : '-';

  content.innerHTML = `
    <dl class="sm:divide-y sm:divide-gray-200">
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Nama Automation</dt>
        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${data.nama_automation}</dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Status</dt>
        <dd class="mt-1 sm:mt-0 sm:col-span-2">
          <span id="statusValue" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}">${status}</span>
        </dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Link Spreadsheet</dt>
        <dd class="mt-1 text-sm text-pink-600 truncate sm:mt-0 sm:col-span-2">
          <a href="${data.link}" target="_blank" class="text-[#da008f] hover:text-[#b8007a] hover:underline" title="${data.link}">Buka Tautan Spreadsheet &nearr;</a>
        </dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Nama File</dt>
        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${data.nama_file || '<span class="text-gray-400 italic">-</span>'}</dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Jam Blast</dt>
        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${data.jam_blast || '-'}</dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Tanggal Blast</dt>
        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${displayBlastDays}</dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Caption / Pesan</dt>
        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 whitespace-pre-wrap bg-gray-50 p-3 rounded-md border border-gray-200">${data.caption || '<span class="text-gray-400 italic">Tanpa caption</span>'}</dd>
      </div>
      <div class="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500">Grup Tujuan</dt>
        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
          ${groupsHtml}
        </dd>
      </div>
      <div class="py-3 sm:py-4 sm:px-0">
        <dt class="text-sm font-medium text-gray-500 mb-2">Konfigurasi Data (Sheets)</dt>
        <dd class="mt-1 text-sm text-gray-900">
          ${sheetsHtml}
        </dd>
      </div>
    </dl>
  `;
}
