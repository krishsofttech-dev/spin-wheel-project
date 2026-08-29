(function(){
  "use strict";

  var adminOverlay = document.getElementById('adminOverlay');
  var loginView = document.getElementById('loginView');
  var panelView = document.getElementById('panelView');

  function openAdmin(){
    adminOverlay.classList.add('show');
    if(App.state.isAdmin){
      showPanel();
    } else {
      loginView.style.display = 'block';
      panelView.style.display = 'none';
      document.getElementById('loginErr').textContent = '';
      document.getElementById('pwInput').value = '';
    }
  }
  document.getElementById('adminCloseBtn').addEventListener('click', function(){
    adminOverlay.classList.remove('show');
  });

  document.addEventListener('keydown', function(e){
    var isR = (e.key === 'r' || e.key === 'R');
    if((e.ctrlKey || e.metaKey) && isR){
      e.preventDefault();
      openAdmin();
    }
  });

  // --- Special code overlay: 5 taps on the SPIN button ---
  // Listens on an overlay hotzone (not the button itself) so this keeps
  // working even after #spinBtn becomes disabled following the first spin.
  var spinTapCount = 0, spinTapTimer = null;
  var spinHotzoneOverlay = document.getElementById('spinHotzoneOverlay');
  if(spinHotzoneOverlay){
    spinHotzoneOverlay.addEventListener('click', function(){
      spinTapCount++;
      clearTimeout(spinTapTimer);
      spinTapTimer = setTimeout(function(){ spinTapCount = 0; }, 3000);

      if(spinTapCount >= 5){
        spinTapCount = 0;
        document.getElementById('codeOverlay').classList.add('show');
        return;
      }

      // Forward the tap to the real button so normal spinning still works.
      var btn = document.getElementById('spinBtn');
      if(btn && !btn.disabled){
        btn.click();
      }
    });
  }

  // --- Admin panel: 8 taps on the WHEEL ---
  var wheelTapCount = 0, wheelTapTimer = null;
  document.querySelector('.wheel-stage').addEventListener('click', function(){
    wheelTapCount++;
    clearTimeout(wheelTapTimer);
    wheelTapTimer = setTimeout(function(){ wheelTapCount = 0; }, 3000);

    if(wheelTapCount >= 8){
      wheelTapCount = 0;
      openAdmin();
    }
  });

  document.getElementById('codeCloseBtn').addEventListener('click', function(){
    document.getElementById('codeOverlay').classList.remove('show');
  });
  document.getElementById('codeForm').addEventListener('submit', function(e){
    e.preventDefault();
    var errEl = document.getElementById('specialCodeErr');
    App.unlockSpecialSpin(document.getElementById('specialCodeInput').value).then(function(unlocked){
      if(unlocked){
        errEl.textContent = '';
        document.getElementById('specialCodeInput').value = '';
        document.getElementById('codeOverlay').classList.remove('show');
      } else {
        errEl.textContent = 'That code is invalid or currently disabled.';
      }
    });
  });

  document.getElementById('loginBtn').addEventListener('click', async function(){
    var email = document.getElementById('emailInput').value.trim();
    var pw = document.getElementById('pwInput').value;
    var errEl = document.getElementById('loginErr');
    if(!App.sb){ errEl.textContent = 'Not connected to Supabase yet.'; return; }
    if(!email || !pw){ errEl.textContent = 'Enter your email and password.'; return; }
    errEl.textContent = '';
    var res = await App.sb.auth.signInWithPassword({ email: email, password: pw });
    if(res.error){
      errEl.textContent = 'Login failed: ' + res.error.message;
      return;
    }
    App.state.session = res.data.session;
    App.state.isAdmin = true;
    await showPanel();
  });

  document.getElementById('signOutBtn').addEventListener('click', async function(){
    if(App.sb) await App.sb.auth.signOut();
    App.state.isAdmin = false;
    App.state.session = null;
    adminOverlay.classList.remove('show');
  });

  document.getElementById('resetDeviceBtn').addEventListener('click', function(){
    App.resetDeviceSpin();
    document.getElementById('deviceResetMsg').textContent = 'This device can spin again.';
    setTimeout(function(){ document.getElementById('deviceResetMsg').textContent = ''; }, 2500);
  });

  async function showPanel(){
    loginView.style.display = 'none';
    panelView.style.display = 'block';
    document.getElementById('whoAmI').textContent = (App.state.session && App.state.session.user && App.state.session.user.email) || '';
    await App.loadSlots();
    await App.loadSettings();
    await App.loadSpecialCodeSettings();
    App.renderWheel();
    renderPrizeManager();
    renderScheduleAdmin();
    renderSpecialCodeSettings();
    renderMaxSpinsAdmin();
    loadGiftLog();
  }

  document.querySelectorAll('.tab').forEach(function(tabBtn){
    tabBtn.addEventListener('click', function(){
      document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
      document.querySelectorAll('.tabpane').forEach(function(p){ p.classList.remove('active'); });
      tabBtn.classList.add('active');
      document.getElementById('tab-' + tabBtn.dataset.tab).classList.add('active');
      if(tabBtn.dataset.tab === 'giftlog') loadGiftLog();
    });
  });

  var editingIndex = null;

  function emptySlotDefaults(id){
    return { id: id, name: '', pack: '', value: '0.00', image_url: '', manual_only: false, disabled: false, active: false };
  }

  function renderPrizeManager(){
    var activeSlots = [];
    App.state.slots.forEach(function(slot, idx){ if(slot.active) activeSlots.push(idx); });

    document.getElementById('fillMeter').textContent =
      activeSlots.length + ' of ' + App.SLOT_COUNT + ' wheel positions filled. The rest show as "Try Again" wedges.';

    var list = document.getElementById('prizeMgrList');
    list.innerHTML = '';
    if(activeSlots.length === 0){
      list.innerHTML = '<div class="empty-slots-note">No prizes added yet. Click Add a prize below to fill in your first wheel position.</div>';
    }
    activeSlots.forEach(function(idx){
      var slot = App.state.slots[idx];
      var card = document.createElement('div');
      card.className = 'prize-mgr-card';
      var thumb = slot.image_url
          ? '<img src="' + App.escapeAttr(slot.image_url) + '" alt="">'
        : '🎁';
      card.innerHTML =
        '<div class="prize-mgr-thumb">' + thumb + '</div>' +
        '<div class="prize-mgr-info">' +
          '<div class="pmi-name">' + App.escapeAttr(slot.name || 'Untitled prize') + '</div>' +
          '<div class="pmi-meta">Position ' + (idx+1) + ' value LKR ' + App.escapeAttr(slot.value || '0.00') + (slot.pack ? ' pack ' + App.escapeAttr(slot.pack) : '') + (slot.manual_only ? ' schedule only' : '') + (slot.disabled ? ' disabled' : '') + '</div>' +
        '</div>' +
        '<div class="prize-mgr-actions">' +
          '<button class="icon-btn" data-edit="' + idx + '">Edit</button>' +
          '<button class="icon-btn danger" data-delete="' + idx + '">Delete</button>' +
        '</div>';
      list.appendChild(card);
    });
  }

  var confirmOverlay = document.getElementById('confirmOverlay');
  var confirmResolve = null;

  function showConfirm(title, message, confirmLabel){
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = message;
    document.getElementById('confirmOkBtn').textContent = confirmLabel || 'Confirm';
    confirmOverlay.classList.add('show');
    return new Promise(function(resolve){
      confirmResolve = resolve;
    });
  }
  function closeConfirm(result){
    confirmOverlay.classList.remove('show');
    if(confirmResolve){ confirmResolve(result); confirmResolve = null; }
  }
  document.getElementById('confirmCancelBtn').addEventListener('click', function(){ closeConfirm(false); });
  document.getElementById('confirmOkBtn').addEventListener('click', function(){ closeConfirm(true); });

  document.getElementById('prizeMgrList').addEventListener('click', async function(e){
    var editIdx = e.target.dataset.edit;
    var delIdx = e.target.dataset.delete;
    if(editIdx !== undefined && editIdx !== ''){
      openPrizeForm(parseInt(editIdx, 10));
    } else if(delIdx !== undefined && delIdx !== ''){
      var idx = parseInt(delIdx, 10);
      var slot = App.state.slots[idx];
      var ok = await showConfirm(
        'Remove this prize?',
        'Remove "' + (slot.name || 'this prize') + '" from the wheel? That position becomes a "Try Again" wedge.',
        'Remove'
      );
      if(!ok) return;
      var cleared = emptySlotDefaults(slot.id);
      App.state.slots[idx] = cleared;
      if(App.sb){
        var res = await App.sb.from('wheel_slots').update(cleared).eq('id', slot.id);
        if(res.error){ alert('Delete failed: ' + res.error.message); return; }
      }
      renderPrizeManager();
      App.renderWheel();
      populateSchedSlotOptions();
    }
  });

  var prizeForm = document.getElementById('prizeForm');
  var targetSlotWrap = document.getElementById('targetSlotWrap');

  document.getElementById('addPrizeBtn').addEventListener('click', function(){
    openPrizeForm(null);
  });

  function openPrizeForm(idx){
    editingIndex = idx;
    var errEl = document.getElementById('pfErr');
    errEl.textContent = '';
    document.getElementById('pfSavedMsg').textContent = '';

    if(idx === null){
      var emptyIdxs = [];
      App.state.slots.forEach(function(slot, i){ if(!slot.active) emptyIdxs.push(i); });
      if(emptyIdxs.length === 0){
        errEl.textContent = 'All ' + App.SLOT_COUNT + ' wheel positions are full. Delete a prize first to add a new one.';
        return;
      }
      document.getElementById('prizeFormTitle').textContent = 'Add a prize';
      targetSlotWrap.style.display = 'block';
      var sel = document.getElementById('pfSlotSelect');
      sel.innerHTML = '';
      emptyIdxs.forEach(function(i){
        var opt = document.createElement('option');
        opt.value = i;
        opt.textContent = 'Position ' + (i+1);
        sel.appendChild(opt);
      });
      document.getElementById('pfName').value = '';
      document.getElementById('pfPack').value = '';
      document.getElementById('pfValue').value = '';
      document.getElementById('pfImageFile').value = '';
      document.getElementById('pfImageNote').textContent = 'Choose a product image from this device.';
      document.getElementById('pfManualOnly').checked = false;
      document.getElementById('pfDisabled').checked = false;
    } else {
      var slot = App.state.slots[idx];
      document.getElementById('prizeFormTitle').textContent = 'Edit prize';
      targetSlotWrap.style.display = 'none';
      document.getElementById('pfName').value = slot.name || '';
      document.getElementById('pfPack').value = slot.pack || '';
      document.getElementById('pfValue').value = slot.value || '';
      document.getElementById('pfImageFile').value = '';
      document.getElementById('pfImageNote').textContent = slot.image_url ? 'Existing image will be kept unless you choose a new file.' : 'Choose a product image from this device.';
      document.getElementById('pfManualOnly').checked = !!slot.manual_only;
      document.getElementById('pfDisabled').checked = !!slot.disabled;
    }

    prizeForm.classList.add('show');
    prizeForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('pfCancelBtn').addEventListener('click', function(){
    prizeForm.classList.remove('show');
  });

  document.getElementById('pfSaveBtn').addEventListener('click', async function(){
    var errEl = document.getElementById('pfErr');
    var name = document.getElementById('pfName').value.trim();
    var pack = document.getElementById('pfPack').value.trim();
    var value = document.getElementById('pfValue').value.trim();
    var imageFile = document.getElementById('pfImageFile').files[0];
    var manual_only = document.getElementById('pfManualOnly').checked;
    var disabled = document.getElementById('pfDisabled').checked;

    if(!name){ errEl.textContent = 'Enter a product name.'; return; }
    if(!value || isNaN(parseFloat(value))){ errEl.textContent = 'Enter a numeric value, e.g. 250.00'; return; }
    errEl.textContent = '';

    var targetIdx = editingIndex === null ? parseInt(document.getElementById('pfSlotSelect').value, 10) : editingIndex;
    var slotId = App.state.slots[targetIdx].id;
    var image_url = App.state.slots[targetIdx].image_url || '';

    if(imageFile){
      if(!App.sb){ errEl.textContent = 'Connect Supabase before uploading an image.'; return; }
      if(imageFile.size > 5 * 1024 * 1024){ errEl.textContent = 'Choose an image smaller than 5 MB.'; return; }
      errEl.textContent = 'Uploading image...';
      var extension = imageFile.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      var imagePath = 'prizes/' + slotId + '-' + Date.now() + '.' + extension;
      var upload = await App.sb.storage.from('prize-images').upload(imagePath, imageFile, {
        contentType: imageFile.type,
        upsert: false
      });
      if(upload.error){ errEl.textContent = 'Image upload failed: ' + upload.error.message; return; }
      image_url = App.sb.storage.from('prize-images').getPublicUrl(imagePath).data.publicUrl;
    }
    errEl.textContent = '';
    var updated = { id: slotId, name: name, pack: pack, value: value, image_url: image_url, manual_only: manual_only, disabled: disabled, active: true };

    if(App.sb){
      var res = await App.sb.from('wheel_slots').update(updated).eq('id', slotId);
      if(res.error){ errEl.textContent = 'Save failed: ' + res.error.message; return; }
    }
    App.state.slots[targetIdx] = updated;

    prizeForm.classList.remove('show');
    renderPrizeManager();
    App.renderWheel();
    populateSchedSlotOptions();
  });

  function populateSchedSlotOptions(){
    var sel = document.getElementById('schedSlot');
    sel.innerHTML = '';
    App.state.slots.forEach(function(slot, idx){
      var opt = document.createElement('option');
      opt.value = slot.id;
      opt.textContent = 'Position ' + (idx+1) + ' ' + (slot.name || 'Prize') + ' value LKR ' + (slot.value||'0');
      sel.appendChild(opt);
    });
  }
  function renderScheduleAdmin(){
    document.getElementById('spinCountLabel').textContent = (App.state.settings && App.state.settings.spin_count) || 0;
    populateSchedSlotOptions();
    var list = document.getElementById('schedList');
    list.innerHTML = '';
    var overrides = (App.state.settings && App.state.settings.overrides) || {};
    var keys = Object.keys(overrides).map(Number).sort(function(a,b){return a-b;});
    if(keys.length === 0){
      list.innerHTML = '<div class="small-note">No scheduled spins yet - all spins draw randomly from non-scheduled prizes.</div>';
      return;
    }
    keys.forEach(function(spinNum){
      var slotId = overrides[String(spinNum)];
      var slot = App.slotById(slotId) || {name:'(deleted)'};
      var row = document.createElement('div');
      row.className = 'sched-row';
      row.innerHTML = '<span>Spin ' + spinNum + ' gives ' + App.escapeAttr(slot.name) + ' value LKR ' + (slot.value||'0') + '</span>' +
        '<button class="btn secondary" data-del="' + spinNum + '">Remove</button>';
      list.appendChild(row);
    });
  }

document.getElementById('schedSlot').addEventListener('focus', function(){
  var el = this;
  setTimeout(function(){
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, 50);
});

  document.getElementById('schedAddBtn').addEventListener('click', function(){
    var num = parseInt(document.getElementById('schedSpinNum').value, 10);
    var slotId = parseInt(document.getElementById('schedSlot').value, 10);
    if(!num || num < 1){ return; }
    App.state.settings.overrides = App.state.settings.overrides || {};
    App.state.settings.overrides[String(num)] = slotId;
    document.getElementById('schedSpinNum').value = '';
    renderScheduleAdmin();
  });
  document.getElementById('schedList').addEventListener('click', function(e){
    var del = e.target.dataset.del;
    if(del !== undefined){
      delete App.state.settings.overrides[del];
      renderScheduleAdmin();
    }
  });
  document.getElementById('saveSchedBtn').addEventListener('click', async function(){
    if(!App.sb) return;
    var res = await App.sb.from('wheel_settings').update({ overrides: App.state.settings.overrides }).eq('id', 1);
    var msg = document.getElementById('schedSavedMsg');
    if(res.error){
      msg.style.color = 'var(--danger)'; msg.textContent = 'Save failed: ' + res.error.message;
    } else {
      msg.style.color = 'var(--ok)'; msg.textContent = 'Saved \u2713';
      setTimeout(function(){ msg.textContent=''; }, 2500);
    }
  });

  async function loadGiftLog(){
    var list = document.getElementById('giftLogList');
    if(!App.sb) return;
    list.innerHTML = '<div class="small-note">Loading\u2026</div>';
    var res = await App.sb.from('gift_log').select('*').order('created_at', { ascending: false }).limit(200);
    if(res.error){
      list.innerHTML = '<div class="small-note">Could not load gift log: ' + App.escapeAttr(res.error.message) + '</div>';
      return;
    }
    if(!res.data || res.data.length === 0){
      list.innerHTML = '<div class="small-note">No prizes given out yet.</div>';
      document.getElementById('giftLogActions').style.display = 'none';
      document.getElementById('selectAllGifts').checked = false;
      return;
    }
    list.innerHTML = '';
    document.getElementById('giftLogActions').style.display = 'flex';
    document.getElementById('selectAllGifts').checked = false;
    res.data.forEach(function(g){
      var row = document.createElement('div');
      row.className = 'gift-row';
      row.dataset.giftId = g.id;
      var d = new Date(g.created_at);
      row.innerHTML =
        '<input type="checkbox" class="gift-checkbox" data-gift-id="' + g.id + '">' +
        '<div class="g-date">' + d.toLocaleString() + '</div>' +
        '<div class="g-main"><b>Spin ' + g.spin_number + '</b> ' + App.escapeAttr(g.product_name) + (g.pack ? ' (' + App.escapeAttr(g.pack) + ')' : '') + '</div>' +
        '<div class="g-value">LKR ' + (g.value || '0.00') + '</div>' +
        '<button class="btn secondary" data-gift-id="' + g.id + '" title="Delete this log">Delete</button>';
      list.appendChild(row);
    });
  }
  document.getElementById('giftLogList').addEventListener('click', async function(e){
    var giftId = e.target.dataset.giftId;
    if(giftId && e.target.textContent === 'Delete'){
      if(!confirm('Delete this gift log entry?')) return;
      var res = await App.sb.from('gift_log').delete().eq('id', giftId);
      if(!res.error){
        loadGiftLog();
      } else {
        alert('Error deleting log: ' + res.error.message);
      }
    }
  });
  
  document.getElementById('selectAllGifts').addEventListener('change', function(){
    var checkboxes = document.querySelectorAll('.gift-checkbox');
    checkboxes.forEach(function(cb){ cb.checked = this.checked; }, this);
  });
  
  document.getElementById('deleteSelectedGiftsBtn').addEventListener('click', async function(){
    var checkboxes = document.querySelectorAll('.gift-checkbox:checked');
    if(checkboxes.length === 0){
      alert('Please select at least one gift log to delete.');
      return;
    }
    if(!confirm('Delete ' + checkboxes.length + ' gift log entries? This cannot be undone.')) return;
    
    var ids = Array.from(checkboxes).map(function(cb){ return cb.dataset.giftId; });
    var res = await App.sb.from('gift_log').delete().in('id', ids);
    if(!res.error){
      loadGiftLog();
    } else {
      alert('Error deleting logs: ' + res.error.message);
    }
  });
  
  document.getElementById('refreshGiftLogBtn').addEventListener('click', loadGiftLog);

  var recordsOverlay = document.getElementById('recordsOverlay');
  document.getElementById('recordsBtn').addEventListener('click', function(){
    var today = new Date();
    var firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('recordsFromDate').valueAsDate = firstDay;
    document.getElementById('recordsToDate').valueAsDate = today;
    recordsOverlay.classList.add('show');
  });
  
  document.getElementById('recordsCloseBtn').addEventListener('click', function(){
    recordsOverlay.classList.remove('show');
  });
  
  document.getElementById('recordsCancelBtn').addEventListener('click', function(){
    recordsOverlay.classList.remove('show');
  });
  
  document.getElementById('recordsGenerateBtn').addEventListener('click', async function(){
    var fromDate = new Date(document.getElementById('recordsFromDate').value + 'T00:00:00Z');
    var toDate = new Date(document.getElementById('recordsToDate').value + 'T23:59:59Z');
    
    if(!App.sb) return alert('Not connected to database');
    
    var res = await App.sb.from('gift_log')
      .select('*')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())
      .order('created_at', { ascending: false });
    
    if(res.error || !res.data || res.data.length === 0){
      alert('No records found for this date range');
      return;
    }
    
    await loadJsPDFLibrary();
    generateGiftRecordsPDF(res.data, fromDate, toDate);
    recordsOverlay.classList.remove('show');
  });
  
  function loadJsPDFLibrary(){
    return new Promise(function(resolve){
      if(window.jspdf && window.jspdf.jsPDF){
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = function(){ resolve(); };
      s.onerror = function(){ resolve(); };
      document.head.appendChild(s);
    });
  }
  
  function generateGiftRecordsPDF(records, fromDate, toDate){
    try{
      if(!window.jspdf || !window.jspdf.jsPDF){
        alert('PDF library not loaded. Please try again.');
        return;
      }
      
      var jsPDFCtor = window.jspdf.jsPDF;
      var doc = new jsPDFCtor('p', 'mm', 'a4');
      var pageHeight = doc.internal.pageSize.getHeight();
      var pageWidth = doc.internal.pageSize.getWidth();
      
      // Colors
      var headerBg = [102, 51, 153]; // Purple
      var headerText = [255, 255, 255]; // White
      var altRowBg = [240, 240, 240]; // Light gray
      var borderColor = [150, 150, 150]; // Gray
      
      // Margins and layout
      var leftMargin = 12;
      var rightMargin = pageWidth - 12;
      var contentWidth = rightMargin - leftMargin;
      var startY = 12;
      
      // Load and add logo
      var img = new Image();
      img.src = 'Images/logo.png';
      img.onload = function(){
        var y = startY;
        
        // Header section with logo and company name
        try{
          doc.addImage(img, 'PNG', leftMargin, y, 12, 12);
        }catch(e){
          // Logo loading failed, continue without it
        }
        
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(102, 51, 153); // Purple
        doc.text('RAINBOW SOLUTIONS', leftMargin + 15, y + 4);
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text('Gift Rewards Report', leftMargin + 15, y + 9);
        
        y += 18;
        
        // Horizontal line
        doc.setDrawColor(102, 51, 153);
        doc.setLineWidth(0.5);
        doc.line(leftMargin, y, rightMargin, y);
        y += 3;
        
        // Report info
        doc.setFontSize(9);
        var dateRange = fromDate.toLocaleDateString() + ' to ' + toDate.toLocaleDateString();
        var infoText = 'Report Period: ' + dateRange + ' | Total Rewards: ' + records.length;
        doc.text(infoText, leftMargin, y);
        y += 6;
        
        // Table setup
        var col1Width = 28; // Date/Time
        var col2Width = 12; // Spin#
        var col3Width = 50; // Product
        var col4Width = 30; // Price
        var rowHeight = 6;
        
        // Prepare table data
        var tableData = [];
        var totalValue = 0;
        
        records.forEach(function(g){
          var d = new Date(g.created_at);
          var dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString().substring(0, 5);
          var spinNum = g.spin_number || '-';
          var product = (g.product_name || 'N/A') + (g.pack ? ' (' + g.pack + ')' : '');
          var price = parseFloat(g.value || 0).toFixed(2);
          
          tableData.push({
            date: dateStr,
            spin: String(spinNum),
            product: product,
            price: price
          });
          
          totalValue += parseFloat(g.value) || 0;
        });
        
        // Draw table
        drawTable(doc, tableData, totalValue, y, leftMargin, col1Width, col2Width, col3Width, col4Width, rowHeight, pageHeight, pageWidth);
        
        // Save PDF
        var filename = 'gift-records-' + fromDate.toISOString().split('T')[0] + '.pdf';
        doc.save(filename);
      };
      
      function drawTable(doc, tableData, totalValue, startY, leftMargin, col1, col2, col3, col4, rowHeight, pageHeight, pageWidth){
        var rightMargin = pageWidth - 12;
        var y = startY;
        var rowCount = 0;
        var headerBg = [102, 51, 153];
        var headerText = [255, 255, 255];
        var altRowBg = [240, 240, 240];
        var borderColor = [150, 150, 150];
        
        // Header row
        doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
        doc.rect(leftMargin, y, col1 + col2 + col3 + col4, rowHeight, 'F');
        
        doc.setTextColor(headerText[0], headerText[1], headerText[2]);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(8);
        doc.text('Date / Time', leftMargin + 1, y + 4);
        doc.text('Spin #', leftMargin + col1 + 1, y + 4);
        doc.text('Product Name', leftMargin + col1 + col2 + 1, y + 4);
        doc.text('Price (LKR)', leftMargin + col1 + col2 + col3 + 1, y + 4);
        
        y += rowHeight;
        
        // Data rows
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7);
        
        tableData.forEach(function(row, idx){
          // Check if we need new page
          if(y + rowHeight > pageHeight - 15){
            doc.addPage();
            y = 15;
            rowCount = 0;
            
            // Repeat header on new page
            doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
            doc.rect(leftMargin, y, col1 + col2 + col3 + col4, rowHeight, 'F');
            
            doc.setTextColor(headerText[0], headerText[1], headerText[2]);
            doc.setFont(undefined, 'bold');
            doc.setFontSize(8);
            doc.text('Date / Time', leftMargin + 1, y + 4);
            doc.text('Spin #', leftMargin + col1 + 1, y + 4);
            doc.text('Product Name', leftMargin + col1 + col2 + 1, y + 4);
            doc.text('Price (LKR)', leftMargin + col1 + col2 + col3 + 1, y + 4);
            
            y += rowHeight;
          }
          
          // Alternate row background
          if(rowCount % 2 === 1){
            doc.setFillColor(altRowBg[0], altRowBg[1], altRowBg[2]);
            doc.rect(leftMargin, y, col1 + col2 + col3 + col4, rowHeight, 'F');
          }
          
          // Text
          doc.setTextColor(0, 0, 0);
          doc.setFont(undefined, 'normal');
          doc.setFontSize(7);
          doc.text(row.date, leftMargin + 1, y + 4);
          doc.text(row.spin, leftMargin + col1 + 1, y + 4);
          doc.text(row.product, leftMargin + col1 + col2 + 1, y + 4, { maxWidth: col3 - 2 });
          doc.text('LKR ' + row.price, leftMargin + col1 + col2 + col3 + 1, y + 4, { align: 'right' });
          
          y += rowHeight;
          rowCount++;
        });
        
        // Total row
        doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
        doc.rect(leftMargin, y, col1 + col2 + col3 + col4, rowHeight, 'F');
        
        doc.setTextColor(headerText[0], headerText[1], headerText[2]);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(8);
        doc.text('TOTAL', leftMargin + 1, y + 4);
        doc.text('LKR ' + totalValue.toFixed(2), leftMargin + col1 + col2 + col3 + 1, y + 4, { align: 'right' });
        
        y += rowHeight;
        
        // Draw all borders at once (no overlap)
        doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
        doc.setLineWidth(0.3);
        
        var tableStartY = startY;
        var tableEndY = y;
        var tableWidth = col1 + col2 + col3 + col4;
        
        // Outer border
        doc.rect(leftMargin, tableStartY, tableWidth, tableEndY - tableStartY);
        
        // Column dividers
        doc.line(leftMargin + col1, tableStartY, leftMargin + col1, tableEndY);
        doc.line(leftMargin + col1 + col2, tableStartY, leftMargin + col1 + col2, tableEndY);
        doc.line(leftMargin + col1 + col2 + col3, tableStartY, leftMargin + col1 + col2 + col3, tableEndY);
        
        // Row dividers
        var currentY = tableStartY + rowHeight;
        for(var i = 0; i < tableData.length; i++){
          if(currentY < tableEndY){
            doc.line(leftMargin, currentY, leftMargin + tableWidth, currentY);
            currentY += rowHeight;
          }
        }
        
        // Footer
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7);
        var footerY = pageHeight - 8;
        doc.text('Generated on ' + new Date().toLocaleString(), leftMargin, footerY);
        doc.text('Page 1', pageWidth - 20, footerY);
      }
      
    }catch(e){
      console.error('PDF generation error:', e);
      alert('Error generating PDF: ' + e.message);
    }
  }

  document.getElementById('resetCountBtn').addEventListener('click', async function(){
    var ok = await showConfirm(
      'Reset spin counter?',
      'This changes which spin number is next. This can\u2019t be undone.',
      'Reset counter'
    );
    if(!ok) return;
    if(!App.sb) return;
    await App.sb.from('wheel_settings').update({ spin_count: 0 }).eq('id', 1);
    App.state.settings.spin_count = 0;
    renderScheduleAdmin();
  });

  function renderMaxSpinsAdmin(){
    var input = document.getElementById('maxSpinsInput');
    if(input) input.value = (App.state.settings && App.state.settings.max_spins_per_device) || 1;
    var rotInput = document.getElementById('spinRotationsInput');
    if(rotInput) rotInput.value = (App.state.settings && App.state.settings.spin_rotations) || 6;
  }
  document.getElementById('saveMaxSpinsBtn').addEventListener('click', async function(){
    var msg = document.getElementById('maxSpinsSavedMsg');
    var val = parseInt(document.getElementById('maxSpinsInput').value, 10);
    if(!val || val < 1){ msg.style.color = 'var(--danger)'; msg.textContent = 'Enter a whole number of 1 or more.'; return; }
    if(!App.sb){ msg.style.color = 'var(--danger)'; msg.textContent = 'Supabase is not connected.'; return; }
    var res = await App.sb.from('wheel_settings').update({ max_spins_per_device: val }).eq('id', 1);
    if(res.error){
      msg.style.color = 'var(--danger)'; msg.textContent = 'Save failed: ' + res.error.message;
      return;
    }
    App.state.settings.max_spins_per_device = val;
    msg.style.color = 'var(--ok)'; msg.textContent = 'Saved \u2713 - customer devices will pick this up on their next load.';
    setTimeout(function(){ msg.textContent=''; }, 3500);
  });
  document.getElementById('saveSpinRotationsBtn').addEventListener('click', async function(){
    var msg = document.getElementById('spinRotationsSavedMsg');
    var val = parseInt(document.getElementById('spinRotationsInput').value, 10);
    if(!val || val < 1){ msg.style.color = 'var(--danger)'; msg.textContent = 'Enter a whole number of 1 or more.'; return; }
    if(!App.sb){ msg.style.color = 'var(--danger)'; msg.textContent = 'Supabase is not connected.'; return; }
    var res = await App.sb.from('wheel_settings').update({ spin_rotations: val }).eq('id', 1);
    if(res.error){
      msg.style.color = 'var(--danger)'; msg.textContent = 'Save failed: ' + res.error.message;
      return;
    }
    App.state.settings.spin_rotations = val;
    msg.style.color = 'var(--ok)'; msg.textContent = 'Saved \u2713 - customer devices will pick this up on their next load.';
    setTimeout(function(){ msg.textContent=''; }, 3500);
  });

  function renderSpecialCodeSettings(){
    var state = document.getElementById('specialCodeState');
    var active = App.state.specialCode && App.state.specialCode.active;
    state.textContent = active ? 'Active' : 'Disabled';
    state.className = active ? 'code-state active' : 'code-state';
  }
  document.getElementById('saveSpecialCodeBtn').addEventListener('click', async function(){
    var code = document.getElementById('adminSpecialCode').value.trim();
    var msg = document.getElementById('specialCodeSavedMsg');
    if(code.length < 4){ msg.textContent = 'Use at least four characters.'; return; }
    if(!App.sb){
      msg.textContent = 'Supabase is not connected. Add your project URL and anon key in js/config.js.';
      return;
    }
    msg.textContent = 'Saving code...';
    var res = await App.sb.from('special_spin_codes')
      .update({ code: code, active: true, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if(res.error){
      if(res.error.message && res.error.message.indexOf('permission denied') !== -1){
        msg.textContent = 'Please sign in again before saving the code.';
      } else {
        msg.textContent = 'Could not save the code: ' + (res.error.message || 'database error');
      }
      return;
    }
    document.getElementById('adminSpecialCode').value = '';
    App.state.specialCode = { active: true };
    renderSpecialCodeSettings();
    msg.textContent = 'Code saved and active.';
  });
  document.getElementById('disableSpecialCodeBtn').addEventListener('click', async function(){
    var msg = document.getElementById('specialCodeSavedMsg');
    if(!App.sb){ msg.textContent = 'Supabase is not connected. Add your project URL and anon key in js/config.js.'; return; }
    var res = await App.sb.from('special_spin_codes')
      .update({ code: '', active: false, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if(res.error){ msg.textContent = 'Could not disable the code: ' + (res.error.message || 'database error'); return; }
    App.state.specialCode = { active: false };
    renderSpecialCodeSettings();
    msg.textContent = 'Special spin code disabled.';
  });
})();
