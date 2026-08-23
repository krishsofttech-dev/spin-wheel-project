(function(){
  "use strict";

  var wheelEl = document.getElementById('wheel');
  var bulbsEl = document.getElementById('bulbs');
  var currentRotation = 0;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var spinUsedKey = 'promo-spin-used';
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

  App.refreshSpinAvailability = function(){
    App.state.spinUsed = localStorage.getItem(spinUsedKey) === '1';
    App.state.specialSpinUsed = localStorage.getItem(specialSpinUsedKey) === '1';
    var button = document.getElementById('spinBtn');
    var status = document.getElementById('spinStatus');
    if(button && !App.state.spinning) button.disabled = App.state.spinUsed;
    if(status){
      status.textContent = App.state.spinUsed ? 'This device has already spun' : 'One spin available on this device';
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
      localStorage.removeItem(spinUsedKey);
      App.refreshSpinAvailability();
      return true;
    });
  };

  App.resetDeviceSpin = function(){
    localStorage.removeItem(spinUsedKey);
    localStorage.removeItem(specialSpinUsedKey);
    App.state.pendingSpecialCode = null;
    // Issue a fresh device token so the next customer on this same kiosk
    // isn't blocked by the previous customer's server-side spin record.
    deviceToken = newDeviceToken();
    localStorage.setItem(deviceTokenKey, deviceToken);
    App.refreshSpinAvailability();
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
      var span = document.createElement('span');
      var isCream = (j % 2 === 1);
      span.style.color = isCream ? '#B32639' : '#FBF3E3';
      var slot = slots[j] || {};
      if(slot.active){
        var v = slot.value ? ("LKR " + String(slot.value).replace(/\.00$/,'')) : 'LKR 0';
        span.textContent = v;
      } else {
        label.classList.add('no-prize');
        span.textContent = 'Try Again';
      }
      label.appendChild(span);
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

  function indexForSlotId(slotId){
    for(var i=0;i<App.state.slots.length;i++){ if(App.state.slots[i].id === slotId) return i; }
    return 0;
  }

  function animateToIndex(winIndex, onDone){
    var sliceDeg = 360 / App.SLOT_COUNT;
    var sliceCenter = winIndex*sliceDeg + sliceDeg/2;
    var jitter = (Math.random()*sliceDeg*0.5) - (sliceDeg*0.25);
    var targetWithinCircle = ((360 - sliceCenter + jitter) % 360 + 360) % 360;

    var extraSpins = reducedMotion ? 1 : (6 + Math.floor(Math.random()*3));
    var currentMod = ((currentRotation % 360) + 360) % 360;
    var deltaToTarget = ((targetWithinCircle - currentMod) % 360 + 360) % 360;
    var totalDelta = extraSpins*360 + deltaToTarget;

    var durationMs = reducedMotion ? 650 : 5200;
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
    var res = await App.sb.rpc('spin_wheel', {
      p_device_token: deviceToken,
      p_special_code: specialCode
    });

    if(res.error || !res.data || res.data.length === 0){
      App.state.spinning = false;
      document.getElementById('spinBtn').disabled = false;
      if(specialCode){
        // The code didn't hold up server-side (already used on this
        // device, or deactivated since it was entered) - restore the
        // normal "already spun" state rather than leaving the button
        // enabled indefinitely.
        App.state.pendingSpecialCode = null;
        localStorage.setItem(spinUsedKey, '1');
        App.refreshSpinAvailability();
        alert('That code is no longer valid. Please check with staff.');
      } else {
        alert('Could not spin right now. Please try again.');
      }
      return;
    }

    if(specialCode){
      App.state.pendingSpecialCode = null;
      localStorage.setItem(specialSpinUsedKey, '1');
    } else {
      localStorage.setItem(spinUsedKey, '1');
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
      if(winSlot.active){
        generateAndUploadReceipt(win, winSlot);
      }
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
      if(!jsPDFCtor || !App.sb) return;
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
      if(!upload.error){
        await App.sb.rpc('attach_gift_pdf', { p_gift_id: win.out_gift_id, p_pdf_path: path });
      }
    }catch(e){}
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
        img.loading = 'lazy';
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
  App.refreshSpinAvailability();
})();
