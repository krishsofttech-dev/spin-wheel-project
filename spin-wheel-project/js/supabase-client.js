(function(){
  "use strict";

  var cfg = App.config;
  App.configured = cfg.SUPABASE_URL.indexOf("YOUR_") !== 0 && cfg.SUPABASE_ANON_KEY.indexOf("YOUR_") !== 0;
  App.sb = null;

  if(App.configured){
    App.sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } else {
    var banner = document.getElementById('setupBanner');
    if(banner) banner.classList.add('show');
  }

  App.SLOT_COUNT = 18;
  App.COLORS = ["#E4384B", "#FBF3E3"];

 App.state = {
  slots: [],
  settings: null,
  spinning: false,
  isAdmin: false,
  session: null,
  spinUsed: false,
  specialSpinUsed: false,
  pendingSpecialCode: null,
  specialCode: { active: false }
};

  App.slotById = function(id){
    for(var i=0;i<App.state.slots.length;i++){ if(App.state.slots[i].id === id) return App.state.slots[i]; }
    return null;
  };

  App.escapeAttr = function(s){
    return (s || '').toString().replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  };

  App.defaultSlotsFallback = function(){
    var arr = [];
    for(var i=0;i<App.SLOT_COUNT;i++){
      arr.push({ id:i, name: "", pack: "", value: "0.00", image_url: "", manual_only: false, active: false });
    }
    arr[0] = { id:0, name:"Toilet Bowl Cleaner - Power", pack:"250 ml", value:"250.00", image_url:"", manual_only:true, active:true };
    return arr;
  };

  App.loadSlots = async function(){
    if(!App.sb){ App.state.slots = App.defaultSlotsFallback(); return; }
    var res = await App.sb.from('wheel_slots').select('*').order('id', { ascending: true });
    if(res.error || !res.data || res.data.length === 0){
      App.state.slots = App.defaultSlotsFallback();
      return;
    }
    App.state.slots = res.data;
  };

  App.loadSettings = async function(){
    if(!App.sb || !App.state.isAdmin){ App.state.settings = { spin_count: 0, overrides: {} }; return; }
    var res = await App.sb.from('wheel_settings').select('*').eq('id', 1).single();
    if(!res.error && res.data){
      App.state.settings = res.data;
    } else {
      App.state.settings = { spin_count: 0, overrides: {} };
    }
  };

  App.loadSpecialCodeSettings = async function(){
    if(!App.sb || !App.state.isAdmin){ App.state.specialCode = { active: false }; return; }
    var res = await App.sb.from('special_spin_codes').select('active').eq('id', 1).single();
    App.state.specialCode = (!res.error && res.data) ? res.data : { active: false };
  };
})();
