(function(){
  "use strict";

  var wheelEl = document.getElementById('wheel');
  var bulbsEl = document.getElementById('bulbs');
  var currentRotation = 0;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var spinCountKey = 'promo-spin-count';
  var specialSpinUsedKey = 'promo-special-spin-used';
  var deviceTokenKey = 'promo-device-token';

  function uuidFallback(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }
  function newDeviceToken(){
    return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : uuidFallback();
  }
  var deviceToken = localStorage.getItem(deviceTokenKey);
  if(!deviceToken){
    deviceToken = newDeviceToken();
    localStorage.setItem(deviceTokenKey, deviceToken);
  }

  // The server (get_wheel_client_state / spin_wheel) is the real source of
  // truth for how many spins this device has left - localStorage here is
  // only used as an immediate offline-friendly fallback before that first
  // round-trip resolves, and while Supabase isn't configured at all.
  App.syncDeviceSpinState = async function(){
    if(!App.sb){
      App.state.maxSpinsPerDevice = 1;
      App.state.spinsUsed = parseInt(localStorage.getItem(spinCountKey) || '0', 10);
      App.state.specialSpinUsed = localStorage.getItem(specialSpinUsedKey) === '1';
      App.state.spinRotations = 6;
      return;
    }
    var res = await App.sb.rpc('get_wheel_client_state', { p_device_token: deviceToken });
    if(!res.error && res.data && res.data.length){
      var row = res.data[0];
      App.state.maxSpinsPerDevice = row.max_spins_per_device || 1;
      App.state.spinsUsed = row.spins_used || 0;
      App.state.specialSpinUsed = !!row.special_spin_used;
      App.state.spinRotations = row.spin_rotations || 6;
    } else {
      App.state.maxSpinsPerDevice = 1;
      App.state.spinsUsed = parseInt(localStorage.getItem(spinCountKey) || '0', 10);
      App.state.specialSpinUsed = localStorage.getItem(specialSpinUsedKey) === '1';
      App.state.spinRotations = 6;
    }
  };

  App.refreshSpinAvailability = function(){
    var max = App.state.maxSpinsPerDevice || 1;
    var used = App.state.spinsUsed || 0;
    var hasSpecialPending = !!App.state.pendingSpecialCode && !App.state.specialSpinUsed;
    App.state.spinUsed = (used >= max) && !hasSpecialPending;
    var button = document.getElementById('spinBtn');
    var status = document.getElementById('spinStatus');
    if(button && !App.state.spinning) button.disabled = App.state.spinUsed;
    if(status){
      if(hasSpecialPending){
        status.textContent = 'Bonus spin unlocked';
      } else if(App.state.spinUsed){
        status.textContent = 'This device has already spun';
      } else if(max > 1){
        status.textContent = (max - used) + ' of ' + max + ' spins left on this device';
      } else {
        status.textContent = 'One spin available on this device';
      }
      status.parentElement.classList.toggle('used', App.state.spinUsed);
    }
  };

  // The final check on whether a code is valid, active, and unused on this
  // device happens server-side inside spin_wheel() at spin time. This is
  // just a quick client-side pre-check for immediate "that looks right"
  // feedback - it is not what actually grants the extra spin.
  App.unlockSpecialSpin = function(code){
    if(App.state.specialSpinUsed || !App.sb) return Promise.resolve(false);
    var entered = (code || '').trim();
    if(!entered) return Promise.resolve(false);
    return App.sb.from('special_spin_codes').select('code, active').eq('id', 1).single().then(function(res){
      var row = (!res.error && res.data) ? res.data : null;
      var matches = !!(row && row.active && row.code && row.code === entered);
      if(!matches) return false;
      App.state.pendingSpecialCode = entered;
      App.refreshSpinAvailability();
      return true;
    });
  };

  App.resetDeviceSpin = function(){
    localStorage.removeItem(spinCountKey);
    localStorage.removeItem(specialSpinUsedKey);
    App.state.pendingSpecialCode = null;
    // Issue a fresh device token so the next customer on this same kiosk
    // isn't blocked by the previous customer's server-side spin record.
    deviceToken = newDeviceToken();
    localStorage.setItem(deviceTokenKey, deviceToken);
    App.syncDeviceSpinState().then(App.refreshSpinAvailability);
  };

  App.renderWheel = function(){
    var slots = App.state.slots;
    var sliceDeg = 360 / App.SLOT_COUNT;
    var stops = [];
    for(var i=0;i<App.SLOT_COUNT;i++){
      var c = App.COLORS[i % 2];
      stops.push(c + " " + (i*sliceDeg) + "deg " + ((i+1)*sliceDeg) + "deg");
    }
    wheelEl.style.background = "conic-gradient(from 0deg, " + stops.join(",") + ")";

    wheelEl.querySelectorAll('.slice-label').forEach(function(n){ n.remove(); });
    for(var j=0;j<App.SLOT_COUNT;j++){
      var centerAngle = j*sliceDeg + sliceDeg/2;
      var label = document.createElement('div');
      label.className = 'slice-label';
      label.style.transform = 'rotate(' + centerAngle + 'deg)';

      var isCream = (j % 2 === 1);
      var textColor = isCream ? '#B32639' : '#FBF3E3';

      var imgWrap = document.createElement('div');
      imgWrap.className = 'slice-img-wrap';

      var textWrap = document.createElement('div');
      textWrap.className = 'slice-text';
      var span = document.createElement('span');
      span.style.color = textColor;

      var slot = slots[j] || {};
      if(slot.active){
        if(slot.image_url){
          var img = document.createElement('img');
          img.src = slot.image_url;
          img.alt = slot.name || '';
          imgWrap.appendChild(img);
        } else {
          imgWrap.innerHTML = '<span class="slice-emoji">🎁</span>';
        }
        var wheelText = slot.name ? String(slot.name).replace(/\s*[-–]\s*/g, ' ').trim() : (slot.value ? ("LKR " + String(slot.value).replace(/\.00$/,'')) : '');
        if(wheelText.length > 14){
          wheelText = wheelText.slice(0, 13).trim() + '…';
        }
        span.textContent = wheelText;
      } else {
        label.classList.add('no-prize');
        imgWrap.innerHTML = '<span class="slice-emoji">😕</span>';
        span.textContent = 'Try Again';
      }

      textWrap.appendChild(span);
      label.appendChild(imgWrap);
      label.appendChild(textWrap);
      wheelEl.appendChild(label);
    }

    if(bulbsEl.childElementCount === 0){
      var bulbCount = 24;
      for(var b=0;b<bulbCount;b++){
        var bulb = document.createElement('div');
        bulb.className = 'bulb';
        bulb.style.transform = 'rotate(' + (b*(360/bulbCount)) + 'deg)';
        bulbsEl.appendChild(bulb);
      }
    }
  };

  App.preloadSlotImages = function(){
    var urls = App.state.slots
      .map(function(slot){ return slot.image_url; })
      .filter(function(url, index, all){ return url && all.indexOf(url) === index; });
    return Promise.all(urls.map(function(url){
      return new Promise(function(resolve){
        var img = new Image();
        img.onload = img.onerror = resolve;
        img.src = url;
      });
    }));
  };

  function indexForSlotId(slotId){
    for(var i=0;i<App.state.slots.length;i++){ if(App.state.slots[i].id === slotId) return i; }
    return 0;
  }

  function animateToIndex(winIndex, onDone){
    var sliceDeg = 360 / App.SLOT_COUNT;
    var sliceCenter = winIndex*sliceDeg + sliceDeg/2;
    var jitter = (Math.random()*sliceDeg*0.5) - (sliceDeg*0.25);
    var targetWithinCircle = ((360 - sliceCenter + jitter) % 360 + 360) % 360;

    // How many full rotations the wheel makes before it starts landing on
    // the result - set by staff in Settings > "Wheel spins before landing".
    var extraSpins = reducedMotion ? 1 : (App.state.spinRotations || 6);
    var currentMod = ((currentRotation % 360) + 360) % 360;
    var deltaToTarget = ((targetWithinCircle - currentMod) % 360 + 360) % 360;
    var totalDelta = extraSpins*360 + deltaToTarget;

    // Scale how long the animation takes with how many rotations it has
    // to cover, so a 2-rotation spin doesn't crawl and a 10-rotation spin
    // doesn't feel instant.
    var durationMs = reducedMotion ? 650 : Math.max(1800, extraSpins*700 + 800);
    currentRotation += totalDelta;
    wheelEl.style.transition = 'transform ' + (durationMs/1000) + 's cubic-bezier(.15,.65,.15,1)';
    wheelEl.style.transform = 'rotate(' + currentRotation + 'deg)';
    setTimeout(onDone, durationMs + 100);
  }

  async function doSpin(){
    if(App.state.spinning) return;
    if(App.state.spinUsed){ App.refreshSpinAvailability(); return; }
    if(!App.sb){ alert('Not connected to Supabase yet. See the banner at the top of the page.'); return; }
    App.state.spinning = true;
    document.getElementById('spinBtn').disabled = true;

    var specialCode = App.state.pendingSpecialCode || null;
    var res;
    try {
      res = await App.sb.rpc('spin_wheel', {
        p_device_token: deviceToken,
        p_special_code: specialCode
      });
    } catch(e) {
      res = { error: e };
    }

    if(res.error || !res.data || res.data.length === 0){
      App.state.spinning = false;
      var reason = (res.error && res.error.message) || '';
      if(res.error) console.error('spin_wheel failed:', res.error);
      if(specialCode){
        // The code didn't hold up server-side (already used on this
        // device, or deactivated since it was entered) - restore the
        // normal "already spun" state rather than leaving the button
        // enabled indefinitely.
        App.state.pendingSpecialCode = null;
        App.state.specialSpinUsed = reason.indexOf('special_code_already_used') !== -1;
        App.refreshSpinAvailability();
        alert('That code is no longer valid. Please check with staff.');
      } else if(reason.indexOf('device_spin_limit_reached') !== -1){
        App.state.spinsUsed = App.state.maxSpinsPerDevice || 1;
        App.refreshSpinAvailability();
        alert('No spins left on this device.');
      } else {
        document.getElementById('spinBtn').disabled = App.state.spinUsed;
        alert('Could not spin right now. Please try again.' + (reason ? '\n\nServer: ' + reason : ''));
      }
      return;
    }

    if(specialCode){
      App.state.pendingSpecialCode = null;
      App.state.specialSpinUsed = true;
      localStorage.setItem(specialSpinUsedKey, '1');
    } else {
      App.state.spinsUsed = (App.state.spinsUsed || 0) + 1;
      localStorage.setItem(spinCountKey, String(App.state.spinsUsed));
    }
    App.refreshSpinAvailability();
    var win = res.data[0];
    var winSlot = {
      id: win.out_slot_id, name: win.out_name, pack: win.out_pack,
      value: win.out_value, image_url: win.out_image_url, active: win.out_active
    };
    var winIndex = indexForSlotId(win.out_slot_id);

    animateToIndex(winIndex, function(){
      showPrize(winSlot);
      App.state.spinning = false;
      // PDF receipts disabled - use Records PDF feature instead
      // if(winSlot.active){
      //   generateAndUploadReceipt(win, winSlot);
      // }
    });
  }

  var jsPDFLoadPromise = null;
  function loadJsPDF(){
    if(window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if(jsPDFLoadPromise) return jsPDFLoadPromise;
    jsPDFLoadPromise = new Promise(function(resolve){
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = function(){ resolve(window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null); };
      s.onerror = function(){ resolve(null); };
      document.head.appendChild(s);
    });
    return jsPDFLoadPromise;
  }

  async function generateAndUploadReceipt(win, winSlot){
    try{
      var jsPDFCtor = await loadJsPDF();
      if(!jsPDFCtor){
        console.warn('jsPDF library failed to load');
        return;
      }
      if(!App.sb){
        console.warn('Supabase not configured');
        return;
      }
      var doc = new jsPDFCtor();
      var now = new Date();
      doc.setFontSize(18); doc.text('Gift Receipt', 20, 22);
      doc.setFontSize(11);
      doc.text('Date: ' + now.toLocaleString(), 20, 34);
      doc.text('Spin #: ' + win.out_spin_number, 20, 42);
      doc.text('Product: ' + (winSlot.name || ''), 20, 52);
      doc.text('Pack size: ' + (winSlot.pack || '-'), 20, 60);
      doc.text('Value: LKR ' + (winSlot.value || '0.00'), 20, 68);
      doc.text('Gift ID: ' + win.out_gift_id, 20, 78);

      var blob = doc.output('blob');
      var path = 'receipts/' + win.out_gift_id + '.pdf';
      var upload = await App.sb.storage.from('gift-receipts').upload(path, blob, { contentType: 'application/pdf' });
      if(upload.error){
        console.error('PDF upload failed:', upload.error);
        return;
      }
      var rpcRes = await App.sb.rpc('attach_gift_pdf', { p_gift_id: win.out_gift_id, p_pdf_path: path });
      if(rpcRes.error){
        console.error('RPC attach_gift_pdf failed:', rpcRes.error);
      }
    }catch(e){
      console.error('Receipt generation error:', e);
    }
  }

  var revealOverlay = document.getElementById('revealOverlay');
  var giftBox = document.getElementById('giftBox');
  var tapMsg = document.getElementById('tapMsg');
  var prizeCard = document.getElementById('prizeCard');
  var lastWinWasActive = false;

  function showPrize(slot){
    var card = document.getElementById('prizeCard');
    var eyebrow = document.getElementById('prizeEyebrow');
    var imgWrap = document.getElementById('prizeImgWrap');
    var claimBtn = document.getElementById('claimBtn');

    if(slot.active === false){
      card.classList.add('no-prize-card');
      eyebrow.textContent = 'So close!';
      document.getElementById('prizeName').textContent = 'Try again next time';
      document.getElementById('prizePack').textContent = 'Thanks for playing.';
      imgWrap.innerHTML = '<span style="font-size:44px;">🎗️</span>';
      claimBtn.textContent = 'Okay';
    } else {
      card.classList.remove('no-prize-card');
      eyebrow.textContent = 'You won';
      document.getElementById('prizeName').textContent = slot.name || 'Mystery prize';
      document.getElementById('prizePack').textContent = slot.pack || '';
      document.getElementById('prizeValue').textContent = 'Worth LKR ' + (slot.value || '0.00');
      imgWrap.innerHTML = '';
      if(slot.image_url){
        var img = document.createElement('img');
        img.src = slot.image_url;
        img.alt = slot.name || 'Prize';
        imgWrap.appendChild(img);
      } else {
        imgWrap.innerHTML = '<span style="font-size:44px;">🎁</span>';
      }
      claimBtn.textContent = 'Awesome, claim my prize';
    }
    lastWinWasActive = slot.active !== false;

    giftBox.classList.remove('open');
    tapMsg.style.display = 'block';
    prizeCard.classList.remove('show');
    revealOverlay.classList.add('show');
  }

  function fireConfetti(){
    if(reducedMotion) return;
    var colors = ['#E4384B', '#F2B705', '#FBF3E3', '#F6D976'];
    var count = 26;
    for(var i=0;i<count;i++){
      (function(){
        var piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = (Math.random()*100) + 'vw';
        piece.style.background = colors[Math.floor(Math.random()*colors.length)];
        piece.style.animationDuration = (2 + Math.random()*1.4) + 's';
        piece.style.animationDelay = (Math.random()*0.4) + 's';
        piece.style.transform = 'rotate(' + Math.floor(Math.random()*360) + 'deg)';
        document.body.appendChild(piece);
        setTimeout(function(){ piece.remove(); }, 4000);
      })();
    }
  }

  function on(id, event, handler){
    var el = document.getElementById(id);
    if(el) el.addEventListener(event, handler);
    return el;
  }

  giftBox.addEventListener('click', function(){
    if(giftBox.classList.contains('open')) return;
    giftBox.classList.add('open');
    tapMsg.style.display = 'none';
    if(lastWinWasActive) fireConfetti();
    setTimeout(function(){ prizeCard.classList.add('show'); }, 350);
  });

  on('claimBtn', 'click', function(){
    revealOverlay.classList.remove('show');
  });

  on('spinBtn', 'click', doSpin);
  on('nextCustomerBtn', 'click', function(){
    if(!App.state.isAdmin){ return; }
    App.resetDeviceSpin();
  });
  // Show a sane default immediately; app.js calls syncDeviceSpinState()
  // during boot and refreshes this again once the real server state (and
  // the admin-configured max spins per device) has loaded.
  App.refreshSpinAvailability();
})();