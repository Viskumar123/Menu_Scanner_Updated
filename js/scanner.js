/**
 * scanner.js — QR Code Scanner & Image Upload Portal for MenuScan.
 * 
 * Features:
 * - Live device camera QR scanning with auto rear/environment camera selection
 * - "Upload QR Code Image" file decoder using Html5Qrcode.scanFile
 * - Drag-and-Drop QR image upload
 * - Table number extraction & URL forwarding (e.g. ?restaurant=R001&table=5)
 * - Featured restaurant directory with 1-click preview
 * - Direct redirection to the scanned restaurant's menu
 */

let _scanner       = null;
let _scannerLive   = false;
let _fileScanner   = null;

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
async function initLanding() {
  try {
    await DB.load();
    _setupDropzone();
    _setupKeyboardListeners();
  } catch (err) {
    console.error('[MenuScan] Failed to load DB:', err);
  }
}

// ═══════════════════════════════════════════════
// ROUTING TO RESTAURANT MENU
// ═══════════════════════════════════════════════
function goToMenu(restaurantId, tableNumber = null) {
  let url = `menu.html?restaurant=${encodeURIComponent(restaurantId)}`;
  if (tableNumber) {
    url += `&table=${encodeURIComponent(tableNumber)}`;
  }
  window.location.href = url;
}

// ═══════════════════════════════════════════════
// LIVE QR CAMERA SCANNER
// ═══════════════════════════════════════════════
function openScanner() {
  document.getElementById('scanner-modal').style.display = 'flex';
  _setText('scanner-status', 'Starting camera…');
  _startScanner();
}

function closeScanner() {
  _stopScanner();
  document.getElementById('scanner-modal').style.display = 'none';
}

function _startScanner() {
  if (_scannerLive) return;
  if (typeof Html5Qrcode === 'undefined') {
    _setText('scanner-status', '⚠️ QR library not loaded. Check internet connection.');
    return;
  }

  _scanner = new Html5Qrcode('qr-reader');

  Html5Qrcode.getCameras()
    .then(cameras => {
      if (!cameras || cameras.length === 0) {
        _setText('scanner-status', '⚠️ No camera detected on this device. Please use "Upload QR Code Image".');
        return;
      }
      const cam = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];
      _scannerLive = true;
      _setText('scanner-status', '📷 Point your camera at a restaurant table QR code…');

      _scanner.start(
        cam.id,
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => _onScanResult(decodedText, 'scanner-status', () => closeScanner()),
        () => {}
      ).catch(err => {
        _setText('scanner-status', '⚠️ Camera access denied. Use "Upload QR Code Image" below.');
        _scannerLive = false;
      });
    })
    .catch(err => _setText('scanner-status', '⚠️ Camera error: ' + err));
}

function _stopScanner() {
  if (_scanner && _scannerLive) {
    _scanner.stop().catch(() => {});
    _scannerLive = false;
    _scanner = null;
  }
}

// ═══════════════════════════════════════════════
// UPLOAD QR CODE IMAGE DECODER
// ═══════════════════════════════════════════════
function openUploadModal() {
  document.getElementById('upload-modal').style.display = 'flex';
  _setText('upload-status', 'Choose or drop an image containing a QR code');
  _resetDropzone();
}

function closeUploadModal() {
  document.getElementById('upload-modal').style.display = 'none';
}

function _resetDropzone() {
  _setText('dropzone-icon', '📥');
  _setText('dropzone-text', 'Click or Drag & Drop your QR Code Image here');
  const inp = document.getElementById('qr-file-input');
  if (inp) inp.value = '';
}

function _setupDropzone() {
  const dropzone = document.getElementById('qr-dropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleQRFileUpload(files);
    }
  });
}

async function handleQRFileUpload(files) {
  if (!files || files.length === 0) return;
  const file = files[0];

  _setText('upload-status', `🔍 Scanning "${file.name}" for QR code…`);
  _setText('dropzone-icon', '⏳');
  _setText('dropzone-text', `Processing ${file.name}…`);

  try {
    if (!_fileScanner) {
      _fileScanner = new Html5Qrcode('hidden-qr-reader');
    }

    const decodedText = await _fileScanner.scanFile(file, true);
    _setText('dropzone-icon', '✅');
    _onScanResult(decodedText, 'upload-status', () => closeUploadModal());

  } catch (err) {
    _setText('dropzone-icon', '❌');
    _setText('dropzone-text', 'No QR code detected in this image. Click to try another image.');
    _setText('upload-status', '⚠️ Could not find a valid QR code in the uploaded image. Please ensure the QR is clear and well-lit.');
  }
}

// ═══════════════════════════════════════════════
// COMMON SCAN RESULT RESOLVER
// ═══════════════════════════════════════════════
function _onScanResult(text, statusElementId, onCloseModal) {
  let restaurantId = null;
  let tableNumber  = null;

  // Pattern 1: URL with ?restaurant=R001 or &restaurant=R001
  try {
    const url = new URL(text);
    restaurantId = url.searchParams.get('restaurant');
    tableNumber  = url.searchParams.get('table');
  } catch {
    // Relative URL or plain string match
    const urlMatch = text.match(/[?&]restaurant=([a-zA-Z0-9_-]+)/i);
    if (urlMatch) restaurantId = urlMatch[1];
    const tableMatch = text.match(/[?&]table=([a-zA-Z0-9_-]+)/i);
    if (tableMatch) tableNumber = tableMatch[1];
  }

  // Pattern 2: Raw ID like "R001", "R002", "MENU_R001"
  if (!restaurantId) {
    const idMatch = text.trim().match(/^(R\d+|MENU_R\d+|[a-zA-Z0-9_-]+)$/i);
    if (idMatch) {
      const candidate = idMatch[1].toUpperCase().replace('MENU_', '');
      if (DB.getRestaurant(candidate)) restaurantId = candidate;
    }
  }

  if (restaurantId && DB.getRestaurant(restaurantId)) {
    const r = DB.getRestaurant(restaurantId);
    const tableLabel = tableNumber ? ` (Table #${tableNumber})` : '';
    _setText(statusElementId, `✅ Identified: ${r.name}${tableLabel}! Opening menu…`);
    setTimeout(() => {
      if (onCloseModal) onCloseModal();
      goToMenu(restaurantId, tableNumber);
    }, 700);
  } else {
    _setText(statusElementId, `❌ Scanned data ("${text.slice(0, 35)}...") is not a recognized restaurant QR.`);
  }
}

function _setupKeyboardListeners() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeScanner();
      closeUploadModal();
    }
  });
}

// ═══════════════════════════════════════════════
// UTIL
// ═══════════════════════════════════════════════
function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

document.addEventListener('DOMContentLoaded', initLanding);
