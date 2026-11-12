const sheetsContainer = document.getElementById('sheetsContainer');
const sheetTemplate = document.getElementById('sheetTemplate');
const rangeTemplate = document.getElementById('rangeTemplate');
const addSheetBtn = document.getElementById('addSheetBtn');
const form = document.getElementById('blastForm');
const formError = document.getElementById('formError');
const successMsg = document.getElementById('successMsg');
const submitBtn = document.getElementById('submitBtn');
const linkInput = document.getElementById('link');
const linkPreview = document.getElementById('linkPreview');
const openLinkBtn = document.getElementById('openLinkBtn');
const groupsList = document.getElementById('groupsList');
const connectWaBtn = document.getElementById('connectWaBtn');
const refreshGroupsBtn = document.getElementById('refreshGroupsBtn');
const blastDays = document.getElementById('blastDays');
const dailyBlast = document.getElementById('dailyBlast');
let availableGroups = [];
let editSelectedGroups = [];
let currentEditId = null;

// ─────────────────────────────────────────────────────────────────────────────────────
// Custom Time Picker — 07:00–18:00, setiap 30 menit
// ─────────────────────────────────────────────────────────────────────────────────────
(function initJamBlastPicker() {
  const TIME_SLOTS = [];
  for (let h = 7; h <= 18; h++) {
    TIME_SLOTS.push(`${String(h).padStart(2,'0')}:00`);
    if (h < 18) TIME_SLOTS.push(`${String(h).padStart(2,'0')}:30`);
  }

  const hiddenInput = document.getElementById('jam_blast');
  const trigger    = document.getElementById('jamBlastTrigger');
  const dropdown   = document.getElementById('jamBlastDropdown');
  const labelEl    = document.getElementById('jamBlastLabel');
  const searchEl   = document.getElementById('jamBlastSearch');
  const listEl     = document.getElementById('jamBlastList');

  if (!trigger) return; // halaman lain

  // Render opsi
  function renderOptions(filter = '') {
    listEl.innerHTML = '';
    const q = filter.trim().toLowerCase();
    let visible = 0;
    TIME_SLOTS.forEach(slot => {
      if (q && !slot.includes(q)) return;
      visible++;
      const el = document.createElement('div');
      el.className = 'tp-option' + (hiddenInput.value === slot ? ' selected' : '');
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', hiddenInput.value === slot ? 'true' : 'false');
      el.dataset.value = slot;
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${slot}`;
      el.addEventListener('click', () => selectTime(slot));
      listEl.appendChild(el);
    });
    if (visible === 0) {
      listEl.innerHTML = '<div class="tp-empty">Tidak ada jam yang cocok</div>';
    }
  }

  function selectTime(value) {
    hiddenInput.value = value;
    labelEl.textContent = value;
    trigger.classList.remove('placeholder');
    closeDropdown();
    // Hapus required-miss highlight jika ada
    trigger.style.borderColor = '';
  }

  function openDropdown() {
    dropdown.classList.add('open');
    trigger.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    searchEl.value = '';
    renderOptions();
    // Scroll ke selected
    requestAnimationFrame(() => {
      const sel = listEl.querySelector('.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
      searchEl.focus();
    });
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    trigger.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.contains('open') ? closeDropdown() : openDropdown();
  });

  searchEl.addEventListener('input', () => renderOptions(searchEl.value));

  // Tutup dropdown saat klik di luar
  document.addEventListener('click', (e) => {
    if (!trigger.closest('#jamBlastWrap').contains(e.target)) closeDropdown();
  });

  // Keyboard: Escape menutup
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });

  // Helper publik untuk set nilai dari luar (edit mode)
  window._setJamBlast = (value) => {
    if (TIME_SLOTS.includes(value)) {
      selectTime(value);
    } else if (value) {
      // Nilai dari DB mungkin format HH:MM:SS, ambil HH:MM
      const hhmm = value.slice(0, 5);
      if (TIME_SLOTS.includes(hhmm)) selectTime(hhmm);
    }
  };
})();

function renderBlastDays(selectedDays = []) {
  const selected = new Set(selectedDays.map(String));
  blastDays.replaceChildren();

  for (let day = 1; day <= 31; day++) {
    const label = document.createElement('label');
    label.className = 'blast-day';
    label.innerHTML = `<input type="checkbox" name="tanggal_blast" value="${day}"${selected.has(String(day)) ? ' checked' : ''}${dailyBlast.checked ? ' disabled' : ''}><span>${day}</span>`;
    blastDays.appendChild(label);
  }
}

const allBlastDays = Array.from({ length: 31 }, (_, index) => index + 1);
renderBlastDays(allBlastDays);

dailyBlast.addEventListener('change', () => {
  renderBlastDays(dailyBlast.checked ? allBlastDays : []);
});

async function loadActiveGroups() {
  groupsList.innerHTML = '<p class="groups-state">Memuat daftar grup...</p>';
  refreshGroupsBtn.disabled = true;
  try {
    const response = await fetch('/api/wa/groups/cache');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Gagal memuat grup');
    availableGroups = data.groups;
    renderGroupCheckboxes();
  } catch (error) {
    groupsList.innerHTML = `<p class="groups-state groups-error">${escapeHtml(error.message)}</p>`;
  } finally {
    refreshGroupsBtn.disabled = false;
  }
}

function renderGroupCheckboxes() {
  if (availableGroups.length === 0) {
    groupsList.innerHTML = '<p class="groups-state">WhatsApp belum terhubung. Scan ulang dari halaman WA Status untuk memuat grup.</p>';
    return;
  }
  groupsList.replaceChildren();
  availableGroups.forEach((group) => {
    const isChecked = editSelectedGroups.includes(group.group_jid);
    const label = document.createElement('label');
    label.className = 'group-option';
    label.innerHTML = `<input type="checkbox" name="group_jids" value="${escapeHtml(group.group_jid)}"${isChecked ? ' checked' : ''}><span><strong>${escapeHtml(group.group_name)}</strong><small>${escapeHtml(group.group_jid)}</small></span>`;
    groupsList.appendChild(label);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

if (connectWaBtn) {
  connectWaBtn.addEventListener('click', async () => {
    connectWaBtn.disabled = true;
    connectWaBtn.textContent = 'Menghubungkan...';
    try {
      const response = await fetch('/api/wa/connect-self', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.needsScan) {
          window.location.assign('/WAstatus');
          return;
        }
        throw new Error(data.error || 'Gagal memulai koneksi WhatsApp.');
      }
      connectWaBtn.textContent = 'Koneksi dimulai';
      if (data.state?.status === 'connected') {
        loadActiveGroups();
      } else {
        window.location.assign('/WAstatus');
      }
    } catch (error) {
      groupsList.innerHTML = `<p class="groups-state groups-error">${escapeHtml(error.message)}</p>`;
      connectWaBtn.disabled = false;
      connectWaBtn.textContent = 'Mulai koneksi';
    }
  });
}
refreshGroupsBtn.addEventListener('click', loadActiveGroups);
loadActiveGroups();

// --- Link opener ---

function updateLinkPreview() {
  const value = linkInput.value.trim();
  let url;

  try {
    url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocol tidak didukung');
  } catch {
    linkPreview.hidden = true;
    return;
  }

  linkPreview.hidden = false;
  openLinkBtn.href = url.href;
}

linkInput.addEventListener('input', updateLinkPreview);

// --- Sheet & Range blocks ---

function addSheetBlock() {
  const clone = sheetTemplate.content.cloneNode(true);
  const sheetBlock = clone.querySelector('.sheet-block');

  sheetBlock.querySelector('.remove-sheet').addEventListener('click', () => {
    sheetBlock.remove();
  });

  sheetBlock.querySelector('.add-range').addEventListener('click', () => {
    addRangeRow(sheetBlock.querySelector('.ranges-container'));
  });

  sheetsContainer.appendChild(sheetBlock);
  addRangeRow(sheetBlock.querySelector('.ranges-container'));
}

function addRangeRow(container) {
  const clone = rangeTemplate.content.cloneNode(true);
  const row = clone.querySelector('.range-row');
  row.querySelector('.remove-range').addEventListener('click', () => {
    row.remove();
  });
  container.appendChild(row);
}

addSheetBtn.addEventListener('click', addSheetBlock);
addSheetBlock();

// --- Collect payload & submit ---

function collectPayload() {
  const sheets = [];
  document.querySelectorAll('.sheet-block').forEach((block) => {
    const sheetSelect = block.querySelector('.sheet-name-select');
    const sheetInput = block.querySelector('.sheet-name-input');
    const sheetName = (sheetSelect.hidden ? sheetInput.value : sheetSelect.value).trim();
    const ranges = [];
    block.querySelectorAll('.range-input').forEach((input) => {
      const val = input.value.trim().toUpperCase();
      if (val) ranges.push(val);
    });
    if (sheetName || ranges.length) {
      sheets.push({ sheet_name: sheetName, ranges });
    }
  });

  const payload = {
    nama_automation: document.getElementById('nama_automation').value.trim(),
    link: document.getElementById('link').value.trim(),
    nama_file: document.getElementById('nama_file').value.trim(),
    jam_blast: document.getElementById('jam_blast').value,
    tanggal_blast: Array.from(document.querySelectorAll('input[name="tanggal_blast"]:checked'))
      .map((input) => Number(input.value))
      .sort((a, b) => a - b)
      .join(','),
    caption: document.getElementById('caption').value.trim(),
    group_jids: Array.from(document.querySelectorAll('input[name="group_jids"]:checked')).map((input) => input.value),
    sheets
  };

  if (currentEditId) {
    payload.id = currentEditId;
  }

  return payload;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.textContent = '';
  successMsg.style.display = 'none';

  const payload = collectPayload();

  if (payload.sheets.length === 0) {
    formError.textContent = 'Minimal 1 sheet dengan 1 range harus diisi';
    return;
  }
  if (payload.group_jids.length === 0) {
    formError.textContent = 'Pilih minimal 1 grup WhatsApp';
    return;
  }
  if (!payload.tanggal_blast) {
    formError.textContent = 'Pilih minimal 1 tanggal blast';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Menyimpan...';

  try {
    const resp = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();

    if (!resp.ok || !data.success) {
      formError.textContent = data.error || 'Gagal submit job';
      return;
    }

    const creator = data.createdBy?.username || data.createdBy?.email || 'akun Anda';
    const actionText = currentEditId ? 'diperbarui' : 'didaftarkan';
    successMsg.textContent = `Job "${payload.nama_automation}" berhasil ${actionText} oleh ${creator}.`;
    successMsg.style.display = 'block';

    // Clear edit state after successful update
    if (currentEditId) {
      currentEditId = null;
      editSelectedGroups = [];
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    form.reset();
    linkPreview.hidden = true;
    availableGroups = [];
    loadActiveGroups();
    dailyBlast.checked = true;
    renderBlastDays(allBlastDays);
    sheetsContainer.innerHTML = '';
    addSheetBlock();
  } catch (err) {
    formError.textContent = 'Terjadi kesalahan koneksi ke server';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Job';
  }
});

// --- Edit Mode ---
async function initEditMode() {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (!editId) return;

  currentEditId = editId;
  submitBtn.textContent = 'Update Job';

  try {
    const res = await fetch(`/api/automations/${editId}`);
    const result = await res.json();

    if (result.success && result.data) {
      const data = result.data;

      document.getElementById('nama_automation').value = data.nama_automation || '';
      document.getElementById('link').value = data.link || '';
      document.getElementById('nama_file').value = data.nama_file || '';
      // Restore jam blast via time picker helper
      if (window._setJamBlast) window._setJamBlast(data.jam_blast || '');
      const selectedBlastDays = (data.tanggal_blast || '').split(',').filter(Boolean);
      const isDaily = selectedBlastDays.length === 31 && allBlastDays.every((day) => selectedBlastDays.includes(String(day)));
      dailyBlast.checked = isDaily;
      renderBlastDays(isDaily ? allBlastDays : selectedBlastDays);
      document.getElementById('caption').value = data.caption || '';

      updateLinkPreview();

      // Clear default empty sheet
      sheetsContainer.innerHTML = '';

      if (data.request_sheets && data.request_sheets.length > 0) {
        data.request_sheets.forEach(sheet => {
          const clone = sheetTemplate.content.cloneNode(true);
          const sheetBlock = clone.querySelector('.sheet-block');

          sheetBlock.querySelector('.sheet-name-input').value = sheet.sheet_name || '';

          sheetBlock.querySelector('.remove-sheet').addEventListener('click', () => {
            sheetBlock.remove();
          });

          sheetBlock.querySelector('.add-range').addEventListener('click', () => {
            addRangeRow(sheetBlock.querySelector('.ranges-container'));
          });

          const rangesContainer = sheetBlock.querySelector('.ranges-container');

          if (sheet.sheet_tables && sheet.sheet_tables.length > 0) {
            sheet.sheet_tables.forEach(table => {
              const rClone = rangeTemplate.content.cloneNode(true);
              const row = rClone.querySelector('.range-row');
              row.querySelector('.range-input').value = table.cell_range || '';
              row.querySelector('.remove-range').addEventListener('click', () => {
                row.remove();
              });
              rangesContainer.appendChild(row);
            });
          } else {
            addRangeRow(rangesContainer);
          }

          sheetsContainer.appendChild(sheetBlock);
        });
      } else {
        addSheetBlock();
      }

      if (data.request_groups && data.request_groups.length > 0) {
        editSelectedGroups = data.request_groups.map(rg => rg.wa_groups?.group_jid).filter(Boolean);
        editSelectedGroups.forEach(jid => {
          const cb = document.querySelector(`input[name="group_jids"][value="${jid}"]`);
          if (cb) cb.checked = true;
        });
      }

    }
  } catch (error) {
    console.error('Failed to load edit data:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEditMode);
} else {
  initEditMode();
}
