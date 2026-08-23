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

  var tapCount = 0, tapTimer = null;
  document.getElementById('titleTap').addEventListener('click', function(){
    tapCount++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function(){ tapCount = 0; }, 3000);
    if(tapCount >= 5){
      tapCount = 0;
      document.getElementById('codeOverlay').classList.add('show');
      document.getElementById('specialCodeInput').focus();
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
    return { id: id, name: '', pack: '', value: '0.00', image_url: '', manual_only: false, active: false };
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
        ? '<img src="' + App.escapeAttr(slot.image_url) + '" alt="" loading="lazy">'
        : '🎁';
      card.innerHTML =
        '<div class="prize-mgr-thumb">' + thumb + '</div>' +
        '<div class="prize-mgr-info">' +
          '<div class="pmi-name">' + App.escapeAttr(slot.name || 'Untitled prize') + '</div>' +
          '<div class="pmi-meta">Position ' + (idx+1) + ' value LKR ' + App.escapeAttr(slot.value || '0.00') + (slot.pack ? ' pack ' + App.escapeAttr(slot.pack) : '') + (slot.manual_only ? ' schedule only' : '') + '</div>' +
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
        errEl.textContent = 'All 18 wheel positions are full. Delete a prize first to add a new one.';
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
    var updated = { id: slotId, name: name, pack: pack, value: value, image_url: image_url, manual_only: manual_only, active: true };

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
      return;
    }
    list.innerHTML = '';
    res.data.forEach(function(g){
      var row = document.createElement('div');
      row.className = 'gift-row';
      var d = new Date(g.created_at);
      row.innerHTML =
        '<div class="g-date">' + d.toLocaleString() + '</div>' +
        '<div class="g-main"><b>Spin ' + g.spin_number + '</b> ' + App.escapeAttr(g.product_name) + (g.pack ? ' (' + App.escapeAttr(g.pack) + ')' : '') + '</div>' +
        '<div class="g-value">LKR ' + (g.value || '0.00') + '</div>' +
        '<button class="btn secondary" data-receipt="' + g.pdf_path + '">Receipt</button>';
      list.appendChild(row);
    });
  }
  document.getElementById('giftLogList').addEventListener('click', async function(e){
    var path = e.target.dataset.receipt;
    if(!path || path === 'null' || path === 'undefined') return;
    var res = await App.sb.storage.from('gift-receipts').createSignedUrl(path, 60);
    if(!res.error && res.data){
      window.open(res.data.signedUrl, '_blank');
    }
  });
  document.getElementById('refreshGiftLogBtn').addEventListener('click', loadGiftLog);

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