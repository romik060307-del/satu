/* WA Cloning RK — copy/export tools for the currently open WhatsApp Web conversation.
 * Export is limited to messages already loaded by WhatsApp Web. It does not bypass
 * disappearing/view-once media or content that WhatsApp does not expose to the page.
 */
(function () {
  'use strict';
  try {
    var W = window;
    var D = document;
    var MAX_TOTAL_MEDIA = 30 * 1024 * 1024;
    var MAX_SINGLE_MEDIA = 12 * 1024 * 1024;
    var MAX_MEDIA_FILES = 30;

    function notify(message) {
      try {
        if (W.WACloningApp && typeof W.WACloningApp.showChatToolMessage === 'function') {
          W.WACloningApp.showChatToolMessage(String(message || ''));
        }
      } catch (ignore) { }
    }

    function currentChat() {
      var main = D.querySelector('#main');
      if (!main) return null;
      var header = main.querySelector('[data-testid*="conversation-panel-header"],[data-testid*="conversation-header"],[data-testid*="conversation-info-header"]') || main.querySelector('header');
      var composer = main.querySelector('footer [contenteditable="true"],[data-testid="conversation-compose-box-input"],[data-tab="10"][contenteditable="true"]');
      if (!header || !composer) return null;
      var name = '';
      var titleNodes = header.querySelectorAll('[title]');
      for (var ti = 0; ti < titleNodes.length && !name; ti++) {
        var titleValue = (titleNodes[ti].getAttribute('title') || '').trim();
        if (titleValue && titleValue.length <= 100 && !/^(search|video call|voice call|more options|cari|panggilan video|panggilan suara|opsi lainnya)$/i.test(titleValue)) name = titleValue;
      }
      if (!name) {
        var lines = (header.innerText || '').split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
        name = lines.find(function (x) { return !/^(online|typing|mengetik|last seen|terakhir dilihat|available|tersedia|video call|voice call|panggilan video|panggilan suara|search|cari)$/i.test(x); }) || 'Percakapan WhatsApp';
      }
      return { main: main, header: header, name: name.slice(0, 160) || 'Percakapan WhatsApp' };
    }

    function getMediaLabel(element) {
      var tag = (element.tagName || '').toLowerCase();
      if (tag === 'video') return 'Video';
      if (tag === 'audio') return 'Pesan suara/audio';
      if (tag === 'img') return 'Foto/gambar';
      return 'Lampiran';
    }

    function messageRecords(chat) {
      var main = chat.main;
      var area = main.querySelector('[data-testid*="conversation-panel-messages"]') || main.querySelector('.copyable-area') || main;
      var candidates = Array.prototype.slice.call(area.querySelectorAll('[data-pre-plain-text]'));
      if (!candidates.length) {
        candidates = Array.prototype.slice.call(area.querySelectorAll('[data-testid="msg-container"],[data-testid*="message-in"],[data-testid*="message-out"]'));
      }
      var seen = [];
      var out = [];
      candidates.forEach(function (node) {
        if (!node || !node.getAttribute) return;
        var prefix = node.getAttribute('data-pre-plain-text') || '';
        var outer = (node.closest && (node.closest('[data-testid="msg-container"]') || node.closest('.message-in,.message-out') || node.closest('[data-testid*="message-in"],[data-testid*="message-out"]'))) || node;
        if (!area.contains(outer)) outer = node;
        if (seen.indexOf(outer) >= 0) return;
        seen.push(outer);

        var prefixMatch = prefix.match(/^\[([^\]]+)\]\s*(.*?):\s*$/);
        var timestamp = prefixMatch ? prefixMatch[1] : '';
        var sender = prefixMatch ? prefixMatch[2] : '';
        var clone = node.cloneNode(true);
        try {
          Array.prototype.forEach.call(clone.querySelectorAll('button,[role="button"],[data-testid*="reaction"],[data-testid*="message-status"],[data-testid*="menu"]'), function (el) { el.remove(); });
        } catch (ignore) { }
        var body = (clone.innerText || clone.textContent || '').replace(/\u200e|\u200f/g, '').trim();
        body = body.replace(/^\s*\n+|\n+\s*$/g, '').replace(/\n{3,}/g, '\n\n');

        var visibleText = ((outer.innerText || '') + ' ' + (outer.getAttribute('aria-label') || '') + ' ' + (outer.getAttribute('title') || '') + ' ' + (outer.getAttribute('data-testid') || '')).toLowerCase();
        // WhatsApp may put the one-time label on a nested button instead of visible message text.
        try {
          var hintNodes = outer.querySelectorAll('[aria-label],[title],[data-testid]');
          for (var hi = 0; hi < hintNodes.length && hi < 40; hi++) {
            visibleText += ' ' + (hintNodes[hi].getAttribute('aria-label') || '') + ' ' + (hintNodes[hi].getAttribute('title') || '') + ' ' + (hintNodes[hi].getAttribute('data-testid') || '');
          }
        } catch (ignore) { }
        var viewOnce = /view.?once|one.?time|sekali lihat|sekali-lihat|hanya dapat dilihat satu kali|media sementara/i.test(visibleText);
        var attachments = [];
        if (!viewOnce) {
          var mediaNodes = outer.querySelectorAll('img,video,audio');
          for (var mi = 0; mi < mediaNodes.length; mi++) {
            var el = mediaNodes[mi];
            var tag = (el.tagName || '').toLowerCase();
            var url = (el.currentSrc || el.src || '').trim();
            if (!url || /^(data:|about:|javascript:)/i.test(url)) continue;
            if (!/^(https?:|blob:)/i.test(url)) continue;
            var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
            var width = Math.max(Number(el.naturalWidth || 0), Number(el.videoWidth || 0), Number(rect.width || 0));
            var height = Math.max(Number(el.naturalHeight || 0), Number(el.videoHeight || 0), Number(rect.height || 0));
            if (tag === 'img' && width < 76 && height < 60) continue; // skip emojis, avatars and UI icons
            if (tag === 'video' && width < 60 && height < 50) continue;
            if (attachments.some(function (a) { return a.url === url; })) continue;
            attachments.push({ url: url, kind: tag, label: getMediaLabel(el), mime: el.type || '', path: '', failure: '' });
          }
        }
        if (viewOnce) {
          body = (body ? body + '\n' : '') + '[Media sekali lihat tidak diekspor]';
        } else if (!body && attachments.length) {
          body = attachments.map(function (a) { return '[' + a.label + ']'; }).join('\n');
        }
        if (!body && !attachments.length) return;
        var cls = '';
        try { cls = String((outer.className && outer.className.baseVal) || outer.className || ''); } catch (ignore) { }
        var outgoing = /message-out|message-outgoing|msg-out/i.test(cls) || !!outer.querySelector('[data-testid*="msg-check"],[data-icon*="msg-check"],[aria-label*="Sent"],[aria-label*="Terkirim"]');
        out.push({ timestamp: timestamp, sender: sender, text: body, outgoing: outgoing, attachments: attachments, viewOnce: viewOnce });
      });
      return out;
    }

    function makeText(chat, messages) {
      var lines = [
        'Ekspor percakapan: ' + chat.name,
        'Dibuat: ' + new Date().toLocaleString(),
        '',
        'Catatan: file ini berisi pesan yang sedang tersedia/termuat di WhatsApp Web saat ekspor. Untuk pesan lama, gulir ke atas dan tunggu sampai pesan lama termuat sebelum mengekspor ulang. Media sekali lihat atau yang tidak dapat diakses oleh WhatsApp Web tidak disertakan.',
        ''
      ];
      messages.forEach(function (m) {
        var stamp = m.timestamp ? '[' + m.timestamp + '] ' : '';
        var who = m.sender || (m.outgoing ? 'Anda' : chat.name);
        var text = m.text || '';
        if (m.attachments.length) {
          var labels = m.attachments.map(function (a) { return '[' + a.label + ']'; });
          if (text) text += '\n' + labels.join('\n'); else text = labels.join('\n');
        }
        lines.push(stamp + who + ': ' + text);
        lines.push('');
      });
      return lines.join('\n');
    }

    function esc(value) {
      return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function makeHtml(chat, messages) {
      var html = '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(chat.name) + '</title>' +
        '<style>body{margin:0;background:#efeae2;color:#202c33;font:15px/1.45 Arial,sans-serif}.top{position:sticky;top:0;background:#075e54;color:#fff;padding:16px 18px;box-shadow:0 1px 4px #0002}.top h1{font-size:18px;margin:0 0 4px}.top p{font-size:12px;margin:0;color:#d9f2eb}.note{margin:12px auto;max-width:860px;padding:10px 12px;background:#fff8d5;border-radius:8px;font-size:12px}.timeline{max-width:860px;margin:0 auto;padding:8px 12px 24px}.msg{box-sizing:border-box;width:fit-content;max-width:88%;margin:8px 0;padding:8px 10px;border-radius:9px;background:#fff;box-shadow:0 1px 1px #0001;overflow-wrap:anywhere}.out{margin-left:auto;background:#d9fdd3}.sender{font-size:12px;font-weight:bold;color:#087f70;margin-bottom:3px}.meta{font-size:10px;color:#667781;text-align:right;margin-top:5px}.body{white-space:pre-wrap}.attachment{display:block;max-width:min(70vw,460px);max-height:460px;margin-top:7px;border-radius:7px}.attachment video{width:100%;max-height:460px}.attachment audio{max-width:100%}.file{display:block;margin-top:6px;font-size:13px}.empty{padding:20px;text-align:center;background:#fff;border-radius:8px}</style></head><body>' +
        '<header class="top"><h1>' + esc(chat.name) + '</h1><p>Ekspor percakapan • ' + esc(new Date().toLocaleString()) + '</p></header>' +
        '<div class="note">Pesan yang tersedia saat ekspor ditampilkan berurutan di bawah. Riwayat lama mungkin belum termuat di WhatsApp Web. Media sekali lihat/dibatasi tidak disertakan.</div><main class="timeline">';
      if (!messages.length) html += '<div class="empty">Belum ada pesan yang dapat diekspor. Buka chat dan tunggu sampai pesan dimuat.</div>';
      messages.forEach(function (m) {
        html += '<article class="msg ' + (m.outgoing ? 'out' : 'in') + '">';
        if (!m.outgoing && m.sender) html += '<div class="sender">' + esc(m.sender) + '</div>';
        html += '<div class="body">' + esc(m.text || '').replace(/\n/g, '<br>') + '</div>';
        m.attachments.forEach(function (a) {
          if (a.path) {
            var path = esc(a.path);
            if (a.kind === 'video') html += '<a class="attachment" href="' + path + '"><video controls preload="metadata" src="' + path + '"></video></a>';
            else if (a.kind === 'audio') html += '<div class="attachment"><audio controls preload="metadata" src="' + path + '"></audio></div>';
            else if (/^image\//i.test(a.mime || '') || /\.(jpe?g|png|webp|gif|heic)$/i.test(a.path)) html += '<a class="attachment" href="' + path + '"><img class="attachment" loading="lazy" src="' + path + '" alt="Foto"></a>';
            else html += '<a class="file" href="' + path + '">Buka lampiran (' + esc(a.label) + ')</a>';
          } else if (a.failure) {
            html += '<div class="file">[' + esc(a.label) + ' tidak disertakan: ' + esc(a.failure) + ']</div>';
          }
        });
        html += '<div class="meta">' + esc(m.timestamp || '') + '</div></article>';
      });
      html += '</main></body></html>';
      return html;
    }

    function safeBaseName(name) {
      return String(name || 'Percakapan').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Percakapan';
    }

    function toBytes(text) { return new TextEncoder().encode(String(text)); }

    function crc32(bytes) {
      if (!crc32.table) {
        crc32.table = new Uint32Array(256);
        for (var n = 0; n < 256; n++) {
          var c = n;
          for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
          crc32.table[n] = c >>> 0;
        }
      }
      var crc = 0xffffffff;
      for (var i = 0; i < bytes.length; i++) crc = crc32.table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
      return (crc ^ 0xffffffff) >>> 0;
    }

    function put16(bytes, at, value) { bytes[at] = value & 255; bytes[at + 1] = (value >>> 8) & 255; }
    function put32(bytes, at, value) { bytes[at] = value & 255; bytes[at + 1] = (value >>> 8) & 255; bytes[at + 2] = (value >>> 16) & 255; bytes[at + 3] = (value >>> 24) & 255; }

    // Small ZIP writer using STORE (no compression), so images/video remain byte-for-byte unchanged.
    function makeZip(files) {
      var localParts = [], centralParts = [], offset = 0;
      var now = new Date();
      var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
      var dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
      files.forEach(function (file) {
        var name = toBytes(file.name);
        var data = file.bytes instanceof Uint8Array ? file.bytes : toBytes(file.bytes);
        var crc = crc32(data);
        var local = new Uint8Array(30 + name.length);
        put32(local, 0, 0x04034b50); put16(local, 4, 20); put16(local, 6, 0x0800); put16(local, 8, 0);
        put16(local, 10, dosTime); put16(local, 12, dosDate); put32(local, 14, crc);
        put32(local, 18, data.length); put32(local, 22, data.length); put16(local, 26, name.length); put16(local, 28, 0); local.set(name, 30);
        localParts.push(local, data);
        var central = new Uint8Array(46 + name.length);
        put32(central, 0, 0x02014b50); put16(central, 4, 20); put16(central, 6, 20); put16(central, 8, 0x0800); put16(central, 10, 0);
        put16(central, 12, dosTime); put16(central, 14, dosDate); put32(central, 16, crc);
        put32(central, 20, data.length); put32(central, 24, data.length); put16(central, 28, name.length); put16(central, 30, 0);
        put16(central, 32, 0); put16(central, 34, 0); put16(central, 36, 0); put32(central, 38, 0); put32(central, 42, offset); central.set(name, 46);
        centralParts.push(central);
        offset += local.length + data.length;
      });
      var centralSize = centralParts.reduce(function (sum, b) { return sum + b.length; }, 0);
      var end = new Uint8Array(22);
      put32(end, 0, 0x06054b50); put16(end, 4, 0); put16(end, 6, 0); put16(end, 8, files.length); put16(end, 10, files.length);
      put32(end, 12, centralSize); put32(end, 16, offset); put16(end, 20, 0);
      var total = offset + centralSize + end.length;
      if (total > 39 * 1024 * 1024) throw new Error('Ukuran ZIP melebihi batas aman 39 MB. Ekspor tanpa media atau kurangi jumlah media yang termuat.');
      var result = new Uint8Array(total), at = 0;
      localParts.concat(centralParts, [end]).forEach(function (part) { result.set(part, at); at += part.length; });
      return result;
    }

    function extensionFor(media, mime) {
      var ext = '';
      try { ext = new URL(media.url, W.location.href).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1] || ''; } catch (ignore) { }
      if (ext && /^(jpg|jpeg|png|webp|gif|heic|mp4|mov|webm|m4a|mp3|ogg|opus|pdf|docx?|xlsx?|pptx?)$/i.test(ext)) return '.' + ext.toLowerCase();
      var m = String(mime || media.mime || '').toLowerCase().split(';')[0].trim();
      var map = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'audio/ogg': '.ogg', 'audio/opus': '.opus', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'application/pdf': '.pdf' };
      if (map[m]) return map[m];
      if (media.kind === 'video') return '.mp4';
      if (media.kind === 'audio') return '.ogg';
      return '.jpg';
    }

    async function readLimited(response, limit) {
      var declared = Number(response.headers && response.headers.get('content-length') || 0);
      if (declared > limit) throw new Error('file terlalu besar');
      if (response.body && response.body.getReader) {
        var reader = response.body.getReader(), chunks = [], total = 0;
        while (true) {
          var part = await reader.read();
          if (part.done) break;
          total += part.value.length;
          if (total > limit) { try { await reader.cancel(); } catch (ignore) { } throw new Error('file terlalu besar'); }
          chunks.push(part.value);
        }
        var bytes = new Uint8Array(total), offset = 0;
        chunks.forEach(function (chunk) { bytes.set(chunk, offset); offset += chunk.length; });
        return bytes;
      }
      var array = new Uint8Array(await response.arrayBuffer());
      if (array.length > limit) throw new Error('file terlalu besar');
      return array;
    }

    function registerAndSave(blob, filename, mime) {
      try {
        if (!W.WACloningApp || typeof W.WACloningApp.downloadChatExport !== 'function') {
          notify('Penyimpanan ekspor belum siap. Muat ulang aplikasi lalu coba lagi.');
          return false;
        }
        var url = URL.createObjectURL(blob);
        W.__rkExportBlobUrl = url;
        if (!Array.isArray(W.__rkMediaItems)) W.__rkMediaItems = [];
        var index = W.__rkMediaItems.length;
        W.__rkMediaItems.push({ id: index, type: 'file', url: url, width: 0, height: 0, mime: mime || blob.type || 'application/octet-stream' });
        W.WACloningApp.downloadChatExport(String(index), filename, mime || blob.type || 'application/octet-stream');
        return true;
      } catch (e) {
        notify('Tidak bisa menyiapkan file ekspor: ' + (e && e.message ? e.message : 'kesalahan tidak diketahui'));
        return false;
      }
    }

    function copyAll() {
      var chat = currentChat();
      if (!chat) { notify('Buka percakapan seseorang terlebih dahulu, lalu pilih Salin semua chat.'); return 'NO_CHAT'; }
      var records = messageRecords(chat);
      var text = makeText(chat, records);
      if (!W.WACloningApp || typeof W.WACloningApp.copyChatText !== 'function') { notify('Fitur salin belum siap. Muat ulang aplikasi.'); return 'NO_BRIDGE'; }
      W.WACloningApp.copyChatText(text);
      return 'OK';
    }

    function exportText() {
      var chat = currentChat();
      if (!chat) { notify('Buka percakapan seseorang terlebih dahulu, lalu pilih Ekspor chat.'); return 'NO_CHAT'; }
      var records = messageRecords(chat);
      var text = makeText(chat, records);
      var filename = 'Chat - ' + safeBaseName(chat.name) + ' - ' + new Date().toISOString().slice(0, 10) + '.txt';
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      notify('Menyiapkan ekspor chat teks…');
      return registerAndSave(blob, filename, 'text/plain') ? 'STARTED' : 'ERROR';
    }

    async function exportWithMedia() {
      if (W.__rkChatExportBusy) { notify('Ekspor sebelumnya masih diproses. Tunggu sampai selesai.'); return 'BUSY'; }
      var chat = currentChat();
      if (!chat) { notify('Buka percakapan seseorang terlebih dahulu, lalu pilih Ekspor chat + media.'); return 'NO_CHAT'; }
      W.__rkChatExportBusy = true;
      try {
        var messages = messageRecords(chat);
        notify('Mengumpulkan chat dan media yang tersedia…');
        var files = [];
        var text = makeText(chat, messages);
        files.push({ name: 'chat.txt', bytes: toBytes(text) });
        var totalMedia = 0, mediaCount = 0, fileByUrl = Object.create(null), serial = 1;
        for (var mi = 0; mi < messages.length; mi++) {
          var message = messages[mi];
          for (var ai = 0; ai < message.attachments.length; ai++) {
            var media = message.attachments[ai];
            if (fileByUrl[media.url]) { media.path = fileByUrl[media.url]; continue; }
            if (mediaCount >= MAX_MEDIA_FILES) { media.failure = 'batas jumlah lampiran (' + MAX_MEDIA_FILES + ') tercapai'; continue; }
            var available = MAX_TOTAL_MEDIA - totalMedia;
            if (available <= 0) { media.failure = 'batas ukuran media total tercapai'; continue; }
            try {
              var response = await fetch(media.url, { credentials: 'include', cache: 'no-store' });
              if (!response.ok) throw new Error('tidak dapat dibaca oleh WhatsApp Web');
              var limit = Math.min(MAX_SINGLE_MEDIA, available);
              var bytes = await readLimited(response, limit);
              if (!bytes.length) throw new Error('file kosong');
              var mime = String(response.headers.get('content-type') || media.mime || '').split(';')[0].trim();
              var ext = extensionFor(media, mime);
              var name = 'media/' + String(serial).padStart(3, '0') + '-' + (media.kind === 'video' ? 'video' : media.kind === 'audio' ? 'audio' : 'foto') + ext;
              files.push({ name: name, bytes: bytes });
              media.path = name;
              media.mime = mime || media.mime;
              fileByUrl[media.url] = name;
              totalMedia += bytes.length; mediaCount++; serial++;
            } catch (e) {
              media.failure = (e && e.message && e.message.indexOf('besar') >= 0) ? 'ukuran melebihi batas aman' : 'tidak dapat diambil dari WhatsApp Web';
            }
          }
        }
        files.push({ name: 'chat.html', bytes: toBytes(makeHtml(chat, messages)) });
        var zipBytes = makeZip(files);
        var filename = 'Chat - ' + safeBaseName(chat.name) + ' - ' + new Date().toISOString().slice(0, 10) + '.zip';
        var blob = new Blob([zipBytes], { type: 'application/zip' });
        var started = registerAndSave(blob, filename, 'application/zip');
        if (!started) return 'ERROR';
        var skipped = messages.reduce(function (n, m) { return n + m.attachments.filter(function (a) { return !a.path; }).length; }, 0);
        notify('Ekspor siap. ' + mediaCount + ' media disertakan' + (skipped ? ', ' + skipped + ' media tidak bisa diambil atau melewati batas ukuran.' : '.') + ' File akan disimpan ke folder Download/WA Cloning.');
        return 'STARTED';
      } catch (e) {
        notify('Ekspor gagal: ' + (e && e.message ? e.message : 'kesalahan tidak diketahui') + '. Coba Ekspor chat (.txt).');
        return 'ERROR';
      } finally {
        W.__rkChatExportBusy = false;
      }
    }

    W.__rkChatTools = {
      copyAll: copyAll,
      exportText: exportText,
      exportWithMedia: function () { exportWithMedia(); return 'STARTED'; }
    };
  } catch (e) {
    try { console.warn('WA Cloning chat tools did not initialize', e); } catch (ignore) { }
  }
})();
