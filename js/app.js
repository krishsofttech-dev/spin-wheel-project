(function(){
  "use strict";

  function shade(hex, percent){
    try{
      var n = parseInt(hex.replace('#',''), 16);
      var r = Math.min(255, Math.max(0, (n >> 16) + Math.round(255 * percent / 100)));
      var g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + Math.round(255 * percent / 100)));
      var b = Math.min(255, Math.max(0, (n & 0xff) + Math.round(255 * percent / 100)));
      return '#' + (0x1000000 + r*0x10000 + g*0x100 + b).toString(16).slice(1);
    }catch(e){ return hex; }
  }

  function applyBranding(){
    var b = App.branding || {};
    if(b.companyName){ document.title = b.companyName; }
    var brandName = document.getElementById('brandName');
    if(brandName && b.companyName){ brandName.textContent = b.companyName; }

    var titleEl = document.getElementById('titleTap');
    if(b.logoUrl){
      var img = document.createElement('img');
      img.src = b.logoUrl;
      img.alt = b.companyName || 'Logo';
      img.style.maxHeight = '56px';
      img.style.maxWidth = '240px';
      img.style.display = 'block';
      titleEl.innerHTML = '';
      titleEl.appendChild(img);
    } else if(b.companyName){
      titleEl.textContent = b.companyName;
    }

    var root = document.documentElement.style;
    if(b.primaryColor){
      root.setProperty('--crimson', b.primaryColor);
      root.setProperty('--crimson-dark', shade(b.primaryColor, -18));
    }
    if(b.goldColor){
      root.setProperty('--gold', b.goldColor);
      root.setProperty('--gold-soft', shade(b.goldColor, 22));
    }
  }

  async function boot(){
    applyBranding();

    if(App.sb){
      var sess = await App.sb.auth.getSession();
      if(sess.data && sess.data.session){
        App.state.session = sess.data.session;
        App.state.isAdmin = true;
      }
    }
    await App.loadSlots();
    App.renderWheel();
  }

  boot();
})();