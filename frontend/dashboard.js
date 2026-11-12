function init() {
  fetchAutomations();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function fetchAutomations() {
  const container = document.getElementById('automationsContainer');
  try {
    const res = await fetch('/api/automations');
    const result = await res.json();
    if (res.status === 401) {
      window.location.assign('/login.html');
      return;
    }
    if (result.success) {
      renderGroups(result.data);
    } else {
      container.innerHTML = `<div class="p-8 text-center text-red-500">Gagal memuat data: ${result.error}</div>`;
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="p-8 text-center text-red-500">Gagal mengambil data automation. Pastikan backend sedang berjalan.</div>`;
  }
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('id-ID', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(date);
}

function normalizeTime(jamBlast) {
  if (!jamBlast) return 'Lainnya';
  // format is "HH:mm:ss" or "HH:mm"
  const parts = jamBlast.split(':');
  if (parts.length < 2) return 'Lainnya';

  let hour = parseInt(parts[0], 10);
  let min = parseInt(parts[1], 10);

  if (isNaN(hour) || isNaN(min)) return 'Lainnya';

  if (min >= 30) min = 30;
  else min = 0;

  const hh = hour.toString().padStart(2, '0');
  const mm = min.toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function renderGroups(data) {
  const container = document.getElementById('automationsContainer');

  if (data.length === 0) {
    container.innerHTML = `<div class="bg-white shadow sm:rounded-lg border border-gray-200 p-12 text-center text-gray-500">Belum ada automation. <a href="/form" class="text-blue-600 hover:underline">Buat sekarang</a></div>`;
    return;
  }

  // Group data
  const groups = {};
  data.forEach(item => {
    const timeCategory = normalizeTime(item.jam_blast);
    if (!groups[timeCategory]) {
      groups[timeCategory] = [];
    }
    groups[timeCategory].push(item);
  });

  // Sort categories by time
  const sortedCategories = Object.keys(groups).sort();

  container.innerHTML = '';

  sortedCategories.forEach(category => {
    const items = groups[category];

    const groupDiv = document.createElement('div');
    groupDiv.className = 'bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200 mb-6';

    // Group Header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'px-6 py-4 bg-gray-50 border-b border-gray-200';
    headerDiv.innerHTML = `<h3 class="text-lg leading-6 font-medium text-gray-900">Jam Blast: ${category}</h3>`;
    groupDiv.appendChild(headerDiv);

    // Group Table
    const tableWrap = document.createElement('div');
    tableWrap.className = 'overflow-x-auto';

    let tableHtml = `
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-white">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Automation</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Terakhir Diubah</th>
            <th scope="col" class="relative px-6 py-3">
              <span class="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
    `;

    items.forEach(item => {
      const statusColor = item.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
      const namaFileDisplay = item.nama_file ? `<div class="text-xs text-gray-500 mt-1"> ${item.nama_file}</div>` : '';

      tableHtml += `
        <tr class="hover:bg-gray-50 transition-colors">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm font-medium text-gray-900">${item.nama_automation}</div>
            ${namaFileDisplay}
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}">
              ${item.status || 'draft'}
            </span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            ${formatDate(item.created_at)}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
            <button type="button" class="px-3 py-2 rounded-md bg-[#da008f] text-white hover:bg-[#b8007a] font-medium btn-read" data-id="${item.id}">Read Detail</button>
          </td>
        </tr>
      `;
    });

    tableHtml += `
        </tbody>
      </table>
    `;

    tableWrap.innerHTML = tableHtml;
    groupDiv.appendChild(tableWrap);
    container.appendChild(groupDiv);
  });

  // Attach event listeners
  document.querySelectorAll('.btn-read').forEach(btn => {
    btn.addEventListener('click', (e) => {
      window.location.assign('/detail?id=' + e.target.getAttribute('data-id'));
    });
  });
}
