// ===========================
// SHIFTLOG — script.js
// ===========================

// ---- STATE ----
let shifts = JSON.parse(localStorage.getItem('shiftlog_shifts') || '[]');
let editingId = null;
let filteredShifts = [];

// ---- UTILS ----
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function saveShifts() {
  localStorage.setItem('shiftlog_shifts', JSON.stringify(shifts));
}

function parseTime(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function diffMinutes(start, end) {
  let s = parseTime(start);
  let e = parseTime(end);
  if (e < s) e += 24 * 60; // overnight shift
  return e - s;
}

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function groupByDate(list) {
  const map = {};
  list.forEach(s => {
    if (!map[s.date]) map[s.date] = [];
    map[s.date].push(s);
  });
  // Sort each day's shifts by start
  Object.keys(map).forEach(d => {
    map[d].sort((a, b) => a.start.localeCompare(b.start));
  });
  return map;
}

function checkOverlap(date, start, end, excludeId = null) {
  const dayShifts = shifts.filter(s => s.date === date && s.id !== excludeId);
  const newStart = parseTime(start);
  let newEnd = parseTime(end);
  if (newEnd < newStart) newEnd += 24 * 60;
  for (const s of dayShifts) {
    let sStart = parseTime(s.start);
    let sEnd = parseTime(s.end);
    if (sEnd < sStart) sEnd += 24 * 60;
    if (newStart < sEnd && newEnd > sStart) return true;
  }
  return false;
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  // Set today in date input
  document.getElementById('shiftDate').value = todayStr();
  document.getElementById('todayDate').textContent = fmtDate(todayStr());

  // Set default filter to bi-weekly
  const fEnd = todayStr();
  const fStart = new Date();
  fStart.setDate(fStart.getDate() - 13);
  document.getElementById('filterStart').value = fStart.toISOString().slice(0, 10);
  document.getElementById('filterEnd').value = fEnd;

  renderLogTable();
  applyFilter();
  initDarkMode();
  initNav();
  initForm();
  initFilter();
  initExport();
  initModal();
});

// ---- DARK MODE ----
function initDarkMode() {
  const saved = localStorage.getItem('shiftlog_theme') || 'light';
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

  document.getElementById('darkToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('shiftlog_theme', next);
  });
}

// ---- NAV ----
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + view).classList.add('active');
      if (view === 'timesheet') applyFilter();
    });
  });
}

// ---- FORM ----
function initForm() {
  const addBtn = document.getElementById('addShiftBtn');
  const overlapWarn = document.getElementById('overlapWarn');

  addBtn.addEventListener('click', () => {
    const date = document.getElementById('shiftDate').value;
    const start = document.getElementById('startTime').value;
    const end = document.getElementById('endTime').value;
    const note = document.getElementById('shiftNote').value.trim();

    if (!date || !start || !end) {
      alert('Please fill in date, start time, and end time.');
      return;
    }
    if (start === end) {
      alert('Start and end time cannot be the same.');
      return;
    }

    overlapWarn.classList.add('hidden');
    if (checkOverlap(date, start, end)) {
      overlapWarn.classList.remove('hidden');
    }

    const shift = { id: genId(), date, start, end, note };
    shifts.push(shift);
    saveShifts();
    renderLogTable();

    // Clear times and note, keep date
    document.getElementById('startTime').value = '';
    document.getElementById('endTime').value = '';
    document.getElementById('shiftNote').value = '';
  });
}

// ---- LOG TABLE ----
function renderLogTable() {
  const tbody = document.getElementById('logBody');
  const empty = document.getElementById('emptyState');
  const totalEl = document.getElementById('totalShifts');

  if (shifts.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    totalEl.textContent = '0';
    return;
  }

  empty.classList.add('hidden');
  totalEl.textContent = shifts.length;

  // Sort by date desc, then start time
  const sorted = [...shifts].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return a.start.localeCompare(b.start);
  });

  tbody.innerHTML = sorted.map(s => {
    const dur = diffMinutes(s.start, s.end);
    return `<tr>
      <td class="td-mono">${fmtDate(s.date)}</td>
      <td class="td-mono">${fmt12(s.start)}</td>
      <td class="td-mono">${fmt12(s.end)}</td>
      <td class="td-duration">${fmtDuration(dur)}</td>
      <td class="td-note">${s.note || '—'}</td>
      <td><div class="td-actions">
        <button class="btn btn-edit" onclick="openEdit('${s.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteShift('${s.id}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ---- DELETE ----
window.deleteShift = function(id) {
  if (!confirm('Delete this shift?')) return;
  shifts = shifts.filter(s => s.id !== id);
  saveShifts();
  renderLogTable();
};

// ---- EDIT MODAL ----
function initModal() {
  document.getElementById('cancelEdit').addEventListener('click', closeEdit);
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('editModal')) closeEdit();
  });
  document.getElementById('saveEdit').addEventListener('click', saveEditShift);
}

window.openEdit = function(id) {
  const s = shifts.find(sh => sh.id === id);
  if (!s) return;
  editingId = id;
  document.getElementById('editDate').value = s.date;
  document.getElementById('editStart').value = s.start;
  document.getElementById('editEnd').value = s.end;
  document.getElementById('editNote').value = s.note || '';
  document.getElementById('editModal').classList.remove('hidden');
};

function closeEdit() {
  editingId = null;
  document.getElementById('editModal').classList.add('hidden');
}

function saveEditShift() {
  const date = document.getElementById('editDate').value;
  const start = document.getElementById('editStart').value;
  const end = document.getElementById('editEnd').value;
  const note = document.getElementById('editNote').value.trim();

  if (!date || !start || !end) {
    alert('Please fill in all fields.');
    return;
  }
  if (start === end) {
    alert('Start and end time cannot be the same.');
    return;
  }

  if (checkOverlap(date, start, end, editingId)) {
    if (!confirm('This shift overlaps with another. Save anyway?')) return;
  }

  shifts = shifts.map(s => s.id === editingId ? { ...s, date, start, end, note } : s);
  saveShifts();
  renderLogTable();
  closeEdit();
}

// ---- FILTER ----
function initFilter() {
  document.getElementById('filterBtn').addEventListener('click', applyFilter);

  document.getElementById('preset2w').addEventListener('click', () => {
    const end = todayStr();
    const start = new Date();
    start.setDate(start.getDate() - 13);
    document.getElementById('filterStart').value = start.toISOString().slice(0, 10);
    document.getElementById('filterEnd').value = end;
    applyFilter();
  });

  document.getElementById('presetWeek').addEventListener('click', () => {
    const end = todayStr();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    document.getElementById('filterStart').value = start.toISOString().slice(0, 10);
    document.getElementById('filterEnd').value = end;
    applyFilter();
  });

  document.getElementById('presetMonth').addEventListener('click', () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    document.getElementById('filterStart').value = start.toISOString().slice(0, 10);
    document.getElementById('filterEnd').value = end.toISOString().slice(0, 10);
    applyFilter();
  });
}

function applyFilter() {
  const start = document.getElementById('filterStart').value;
  const end = document.getElementById('filterEnd').value;

  if (!start || !end) {
    filteredShifts = [...shifts];
  } else {
    filteredShifts = shifts.filter(s => s.date >= start && s.date <= end);
  }

  renderTimesheetTable(filteredShifts);
  updateSummary(filteredShifts);
}

// ---- TIMESHEET TABLE ----
function renderTimesheetTable(list) {
  const tbody = document.getElementById('tsBody');
  const empty = document.getElementById('tsEmpty');

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const grouped = groupByDate(list);
  const dates = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  tbody.innerHTML = dates.map(date => {
    const dayShifts = grouped[date];
    const totalMin = dayShifts.reduce((acc, s) => acc + diffMinutes(s.start, s.end), 0);
    const shiftsList = dayShifts.map(s => `${fmt12(s.start)} – ${fmt12(s.end)}`).join('<br>');

    return `<tr>
      <td class="td-mono">${fmtDate(date)}</td>
      <td><div class="shifts-list">${shiftsList}</div></td>
      <td class="td-total">${fmtDuration(totalMin)}</td>
    </tr>`;
  }).join('');
}

function updateSummary(list) {
  const grouped = groupByDate(list);
  const days = Object.keys(grouped).length;
  const totalMin = list.reduce((acc, s) => acc + diffMinutes(s.start, s.end), 0);

  document.getElementById('sumDays').textContent = days;
  document.getElementById('sumShifts').textContent = list.length;
  document.getElementById('sumHours').textContent = fmtDuration(totalMin);
}

// ---- PDF EXPORT ----
function initExport() {
  document.getElementById('genPdfBtn').addEventListener('click', generatePDF);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
}

function generatePDF() {
  if (!window.jspdf) {
    alert('PDF library not loaded. Please check your internet connection.');
    return;
  }

  if (filteredShifts.length === 0) {
    alert('No shifts in selected range to export.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const start = document.getElementById('filterStart').value;
  const end = document.getElementById('filterEnd').value;

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;

  // ---- HEADER ----
  // Top bar
  doc.setFillColor(42, 92, 255);
  doc.rect(0, 0, pageW, 18, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('SHIFTLOG', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Generated: ' + fmtDate(todayStr()), pageW - margin, 12, { align: 'right' });

  // Title
  doc.setTextColor(26, 25, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Work Timesheet', margin, 36);

  // Date range
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120, 118, 110);
  doc.text(`Period: ${fmtDate(start)} — ${fmtDate(end)}`, margin, 44);

  // Divider
  doc.setDrawColor(220, 218, 210);
  doc.setLineWidth(0.5);
  doc.line(margin, 50, pageW - margin, 50);

  // ---- TABLE ----
  const grouped = groupByDate(filteredShifts);
  const dates = Object.keys(grouped).sort();

  const tableRows = dates.map(date => {
    const dayShifts = grouped[date];
    const totalMin = dayShifts.reduce((acc, s) => acc + diffMinutes(s.start, s.end), 0);
    const shiftStrs = dayShifts.map(s => `${fmt12(s.start)} – ${fmt12(s.end)}`).join('\n');
    return [fmtDate(date), shiftStrs, fmtDuration(totalMin)];
  });

  const totalAllMin = filteredShifts.reduce((acc, s) => acc + diffMinutes(s.start, s.end), 0);

  doc.autoTable({
    startY: 58,
    head: [['Date', 'Shift(s)', 'Total Hours']],
    body: tableRows,
    foot: [['', 'TOTAL', fmtDuration(totalAllMin)]],
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [26, 25, 22],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 5,
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 5,
      textColor: [26, 25, 22],
    },
    footStyles: {
      fillColor: [42, 92, 255],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 6,
    },
    alternateRowStyles: {
      fillColor: [245, 244, 240],
    },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 80 },
      2: { cellWidth: 32, halign: 'right' },
    },
    tableLineColor: [220, 218, 210],
    tableLineWidth: 0.3,
  });

  // ---- FOOTER ----
  const finalY = doc.lastAutoTable.finalY + 10;

  // Summary box
  doc.setFillColor(240, 239, 233);
  doc.roundedRect(margin, finalY, pageW - margin * 2, 28, 3, 3, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 118, 110);
  doc.text('SUMMARY', margin + 8, finalY + 8);

  const summaryItems = [
    { label: 'Days Worked', val: String(dates.length) },
    { label: 'Total Shifts', val: String(filteredShifts.length) },
    { label: 'Total Hours', val: fmtDuration(totalAllMin) },
  ];

  let sx = margin + 8;
  summaryItems.forEach((item, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(26, 25, 22);
    doc.text(item.val, sx, finalY + 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 118, 110);
    doc.text(item.label, sx, finalY + 25);

    sx += 56;
  });

  // Bottom page note
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setTextColor(180, 178, 170);
  doc.text('ShiftLog — Daily Job Timesheet', pageW / 2, pageH - 10, { align: 'center' });

  // Save
  const filename = `timesheet_${start}_to_${end}.pdf`;
  doc.save(filename);
}

// ---- CSV EXPORT ----
function exportCSV() {
  if (shifts.length === 0) {
    alert('No shifts to export.');
    return;
  }

  const sorted = [...shifts].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  const rows = [
    ['Date', 'Start', 'End', 'Duration (min)', 'Duration', 'Note'],
    ...sorted.map(s => {
      const dur = diffMinutes(s.start, s.end);
      return [s.date, s.start, s.end, dur, fmtDuration(dur), s.note || ''];
    })
  ];

  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shiftlog_export_${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
