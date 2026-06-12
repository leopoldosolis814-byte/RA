const SUPABASE_URL = 'https://ezjomcqgztccpkdsasvv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6am9tY3FnenRjY3BrZHNhc3Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMzM5MzEsImV4cCI6MjA5NjcwOTkzMX0.obTrBUaraj3kquVYGyl-P9Oz7Rpkb2az0dQvQ6poGcY';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentPage = 0;
const PAGE_SIZE = 6;
let activeDestination = 'patagonia';

const PLANS = {
  traveler_plus: { name: 'Traveler Plus', price: '$9/mes', color: 'var(--orange)', emoji: '🚐',
    desc: 'WhatsApp directo · Sin ads · Filtros avanzados',
    plan_id: 'P-09P37941BU408581UNIVDOPQ'
  },
  trust_pass:    { name: 'Trust Pass',    price: '$15/match', color: 'var(--green)', emoji: '🛡️',
    desc: 'Video-call · Botón pánico GPS · $50 crédito',
    plan_id: 'P-7RK1818630999430DNIVD6DA'
  },
  host_pro:      { name: 'Host Pro',      price: '$20/mes', color: '#333', emoji: '🏆',
    desc: 'Primero en rankings · Badge verificado · Analytics',
    plan_id: 'P-02Y49045B0689325WNIVD3SY'
  }
};

let activePlan = null;

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('heroSearch').placeholder = 'Destino, país, tipo de van...';
  const { data: { session } } = await sb.auth.getSession();
  if (session) setUserSession(session.user);
  sb.auth.onAuthStateChange((_e, session) => {
    currentUser = session?.user || null;
    updateNavForUser();
  });
  await loadVans();
  loadStats();
});

function toggleLang() {
  const h = document.documentElement;
  const l = h.getAttribute('data-lang') === 'es' ? 'en' : 'es';
  h.setAttribute('data-lang', l); h.setAttribute('lang', l);
  document.getElementById('langBtn').textContent = l === 'es' ? 'EN' : 'ES';
  document.getElementById('heroSearch').placeholder = l === 'es' ? 'Destino, país, tipo de van...' : 'Destination, country, van type...';
}

function openModal(id) { document.getElementById('modal-' + id).classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { const m = document.getElementById('modal-' + id); if (m) { m.classList.remove('open'); document.body.style.overflow = ''; } }
function switchModal(from, to) { closeModal(from); setTimeout(() => openModal(to), 100); }

document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', function(e) {
  if (e.target === this) { this.classList.remove('open'); document.body.style.overflow = ''; }
}));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => { m.classList.remove('open'); document.body.style.overflow = ''; });
});

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function togglePill(el) { el.classList.toggle('active'); }

function setLoading(btnId, loading) {
  const b = document.getElementById(btnId);
  if (b) { b.disabled = loading; b.style.opacity = loading ? '0.6' : '1'; }
}

function setUserSession(user) {
  currentUser = user;
  updateNavForUser();
}

function updateNavForUser() {
  if (currentUser) {
    const email = currentUser.email?.split('@')[0] || 'Usuario';
    const btn = document.querySelector('button[onclick="openModal(\'signup\')"]');
    if (btn) { btn.textContent = '👤 ' + email; btn.onclick = () => openModal('user-menu'); }
  }
}

async function handleSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-pass').value;
  if (!email || !pass) return showToast('❌ Completá todos los campos');
  setLoading('btn-signup', true);
  const { data, error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { name } }
  });
  setLoading('btn-signup', false);
  if (error) return showToast('❌ ' + error.message);
  showToast('✅ ¡Cuenta creada! Bienvenido/a 🎉');
  closeModal('signup');
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (!email || !pass) return showToast('❌ Ingresá email y contraseña');
  setLoading('btn-login', true);
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  setLoading('btn-login', false);
  if (error) return showToast('❌ ' + (error.message.includes('Invalid') ? 'Email o contraseña incorrectos' : error.message));
  showToast('✅ ¡Hola de nuevo! 👋');
  closeModal('login');
}

async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  showToast('👋 Sesión cerrada');
  location.reload();
}

async function handleHostSignup() {
  const name = document.getElementById('host-name').value.trim();
  const email = document.getElementById('host-email').value.trim();
  const country = document.getElementById('host-country').value;
  const city = document.getElementById('host-city')?.value.trim() || '';
  const whatsapp = document.getElementById('host-whatsapp').value.trim();
  const price = document.getElementById('host-price')?.value || null;
  const desc = document.getElementById('host-desc')?.value.trim() || '';
  const photoFiles = document.getElementById('host-photos')?.files;
  if (!name || !email) return showToast('❌ Nombre y email requeridos');

  setLoading('btn-host-signup', true);
  let userId = currentUser?.id;
  if (!userId) {
    const tempPass = Math.random().toString(36).slice(-10) + 'Ra1!';
    const { data: authData, error: authError } = await sb.auth.signUp({ email, password: tempPass, options: { data: { name } } });
    if (authError && !authError.message.includes('already registered')) {
      setLoading('btn-host-signup', false);
      return showToast('❌ ' + authError.message);
    }
    userId = authData?.user?.id;
  }

  if (!userId) { setLoading('btn-host-signup', false); return showToast('⚠️ Iniciá sesión primero'); }

  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36);
  const { data: hostData, error: hostError } = await sb.from('hosts').insert({
    user_id: userId, van_name: name, slug, country: country || 'other',
    city, whatsapp, description: desc,
    price_per_day: price ? parseFloat(price) : null
  }).select().single();

  if (hostError) { setLoading('btn-host-signup', false); return showToast('❌ ' + hostError.message); }

  if (photoFiles && photoFiles.length > 0 && hostData) {
    showToast('📷 Subiendo fotos...');
    await uploadHostPhotos(hostData.id, photoFiles);
  }

  setLoading('btn-host-signup', false);
  showToast('🚐 ¡Perfil creado exitosamente! Bienvenido/a 🎉');
  closeModal('host-signup');
  await loadVans();
}

async function loadVans(append = false) {
  const grid = document.getElementById('vanGrid');
  if (!append) { grid.innerHTML = '<div class="col-span-3 text-center py-12 text-gray-400">Cargando vans...</div>'; }

  const q = document.getElementById('heroSearch')?.value || '';
  const country = document.getElementById('countryFilter')?.value || '';

  let query = sb.from('hosts')
    .select(`*, host_tags(tag), host_photos(url, is_cover)`)
    .eq('is_active', true)
    .order('ranking_score', { ascending: false })
    .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

  if (country) query = query.eq('country', country);
  if (q) query = query.ilike('van_name', `%${q}%`);

  const destMap = { patagonia: { country: 'ar', region: 'Patagonia' }, chile: { country: 'cl' }, mexico: { country: 'mx' }, newzealand: { country: 'nz' } };
  if (destMap[activeDestination]?.country) query = query.eq('country', destMap[activeDestination].country);

  const { data, error } = await query;

  if (error) { grid.innerHTML = '<div class="col-span-3 text-center py-12 text-red-400">Error cargando vans. Intentá de nuevo.</div>'; return; }

  if (!append) grid.innerHTML = '';

  if (!data || data.length === 0) {
    grid.innerHTML = '<div class="col-span-3 text-center py-12 text-gray-400">🔍 No hay vans en esta zona todavía.<br><span class="text-sm">¿Tenés una van? <button onclick="openModal(\'host-signup\')" class="text-orange-500 font-bold underline">Publicala gratis</button></span></div>';
    return;
  }

  data.forEach((host, i) => {
    const rank = currentPage * PAGE_SIZE + i + 1;
    const cover = host.host_photos?.find(p => p.is_cover)?.url || host.host_photos?.[0]?.url || 'https://res.cloudinary.com/ds2udm1nc/image/upload/v1781063007/img4_y0bjie.png';
    const tags = host.host_tags?.map(t => tagLabel(t.tag)).join('') || '';
    const stars = '★'.repeat(Math.round(host.avg_rating || 0)) + '☆'.repeat(5 - Math.round(host.avg_rating || 0));
    const badgePlan = host.plan === 'host_pro' ? '<span class="badge" style="background:rgba(26,138,90,0.9);color:white">🏆 Pro</span>' : '';
    const verBadge = host.is_verified ? '<span class="badge" style="background:rgba(0,0,0,0.7);color:white">✅</span>' : '';
    const rankColor = rank === 1 ? 'var(--orange)' : rank === 2 ? '#888' : rank === 3 ? '#A0522D' : '#555';

    grid.insertAdjacentHTML('beforeend', `
      <div class="van-card" onclick="openVanModal('${host.id}')">
        <div class="relative">
          <img src="${cover}" alt="${host.van_name}" class="w-full h-48 object-cover" loading="lazy">
          <div class="absolute top-3 left-3 flex gap-1">
            <span class="badge" style="background:${rankColor};color:white">#${rank}</span>
            ${verBadge}${badgePlan}
          </div>
          <button class="absolute top-3 right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center text-gray-400 text-lg" onclick="event.stopPropagation(); toggleFav(this, '${host.id}')">♡</button>
        </div>
        <div class="p-4">
          <div class="flex justify-between mb-2">
            <div><h3 class="font-bold">${host.van_name}</h3><p class="text-sm text-gray-500">${host.city || ''}, ${countryName(host.country)}</p></div>
            <div class="text-right"><div class="stars">${stars}</div><p class="text-xs text-gray-400">${host.avg_rating?.toFixed(1) || '-'} (${host.total_reviews})</p></div>
          </div>
          <div class="flex flex-wrap gap-1 mb-3">${tags}</div>
          <div class="flex justify-between items-center">
            <div>
              <span class="text-xs text-gray-400">Desde</span>
              <p class="font-bold text-xl" style="color:var(--orange)">${host.price_per_day ? '$' + host.price_per_day : 'Consultar'} <span class="text-sm text-gray-400">${host.price_per_day ? '/día' : ''}</span></p>
            </div>
            <button class="btn-primary text-sm py-2 px-4" style="width:auto" onclick="event.stopPropagation(); openVanModal('${host.id}')">Contactar</button>
          </div>
        </div>
      </div>`);
  });
}

async function openVanModal(hostId) {
  document.getElementById('vanDetailContent').innerHTML = '<div class="text-center py-8 text-gray-400">Cargando...</div>';
  openModal('van-detail');

  sb.from('host_views').insert({ host_id: hostId, viewer_id: currentUser?.id || null });

  const { data: host, error } = await sb.from('hosts')
    .select(`*, host_tags(tag), host_photos(url, is_cover), profiles(name, avatar_url)`)
    .eq('id', hostId).single();

  if (error || !host) { document.getElementById('vanDetailContent').innerHTML = '<p class="text-red-400">Error cargando perfil</p>'; return; }

  const cover = host.host_photos?.find(p => p.is_cover)?.url || host.host_photos?.[0]?.url || 'https://res.cloudinary.com/ds2udm1nc/image/upload/v1781063007/img4_y0bjie.png';
  const stars = '★'.repeat(Math.round(host.avg_rating || 0)) + '☆'.repeat(5 - Math.round(host.avg_rating || 0));
  const tags = host.host_tags?.map(t => `<span class="badge" style="background:#FFF3E0;color:#E65100">${tagLabel(t.tag)}</span>`).join('') || '';
  const lang = document.documentElement.getAttribute('data-lang') || 'es';

  document.getElementById('vanDetailContent').innerHTML = `
    <img src="${cover}" class="w-full h-44 object-cover rounded-2xl mb-4">
    <div class="stars mb-1">${stars}</div>
    <h2 class="syne text-2xl font-black mb-1">${host.van_name}</h2>
    <p class="text-gray-500 text-sm mb-3">📍 ${host.city || ''}, ${countryName(host.country)}</p>
    <p class="text-gray-600 text-sm mb-4">${host.description || (lang === 'es' ? 'Sin descripción aún.' : 'No description yet.')}</p>
    <div class="flex flex-wrap gap-2 mb-4">${tags}</div>
    <div class="flex justify-between p-4 rounded-xl bg-gray-50 mb-5">
      <div><p class="text-xs text-gray-400">Host</p><p class="font-bold">${host.profiles?.name || 'Anónimo'}</p></div>
      <div><p class="text-xs text-gray-400">Rating</p><p class="font-bold">${host.avg_rating?.toFixed(1) || '-'} ⭐ (${host.total_reviews})</p></div>
      <div><p class="text-xs text-gray-400">${lang === 'es' ? 'Precio' : 'Price'}</p><p class="font-bold text-orange-600">${host.price_per_day ? '$' + host.price_per_day + '/día' : 'Consultar'}</p></div>
    </div>
    <button onclick="handleContact('${hostId}', '${host.whatsapp || ''}')" class="btn-primary w-full justify-center py-3">
      💬 ${lang === 'es' ? 'Contactar host' : 'Contact host'}
    </button>
    <p class="text-center text-xs text-gray-400 mt-3">${lang === 'es' ? 'Requiere Traveler Plus para ver WhatsApp directo' : 'Requires Traveler Plus for direct WhatsApp'}</p>`;
}

async function handleContact(hostId, whatsapp) {
  if (!currentUser) { closeModal('van-detail'); openModal('signup'); return; }

  await sb.from('matches').insert({ host_id: hostId, traveler_id: currentUser.id });

  const { data: profile } = await sb.from('profiles').select('plan').eq('id', currentUser.id).single();
  if (profile?.plan === 'traveler_plus' || profile?.plan === 'trust_pass') {
    if (whatsapp) { window.open('https://wa.me/' + whatsapp.replace(/\D/g, ''), '_blank'); }
    else { showToast('📞 El host no tiene WhatsApp cargado aún'); }
  } else {
    closeModal('van-detail');
    showToast('🔒 Necesitás Traveler Plus para contacto directo');
    setTimeout(() => { document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }, 500);
  }
}

async function toggleFav(btn, hostId) {
  if (!currentUser) { openModal('signup'); return; }
  const isFaved = btn.textContent === '♥';
  if (isFaved) {
    await sb.from('favorites').delete().match({ user_id: currentUser.id, host_id: hostId });
    btn.textContent = '♡'; btn.style.color = '';
    showToast('💔 Quitado de favoritos');
  } else {
    await sb.from('favorites').insert({ user_id: currentUser.id, host_id: hostId });
    btn.textContent = '♥'; btn.style.color = '#EF4444';
    showToast('❤️ Guardado en favoritos');
  }
}

async function handleSearch() {
  currentPage = 0;
  await loadVans();
}

async function loadMore() {
  currentPage++;
  await loadVans(true);
}

async function switchTab(el, dest) {
  document.querySelectorAll('.pill').forEach(p => { if (p.getAttribute('onclick')?.includes('switchTab')) p.classList.remove('active'); });
  el.classList.add('active');
  activeDestination = dest;
  currentPage = 0;
  await loadVans();
}

async function subscribeNewsletter() {
  const email = document.getElementById('newsletterEmail').value.trim();
  if (!email) return showToast('❌ Ingresá tu email');
  const lang = document.documentElement.getAttribute('data-lang') || 'es';
  const { error } = await sb.from('newsletter').insert({ email, language: lang });
  if (error?.code === '23505') return showToast('📬 Ya estás suscrito/a!');
  if (error) return showToast('❌ ' + error.message);
  showToast('🔔 ¡Suscripto/a!');
  document.getElementById('newsletterEmail').value = '';
}

function openPayment(planKey) {
  if (!currentUser) { openModal('signup'); showToast('📌 Primero creá tu cuenta'); return; }
  activePlan = planKey;
  const plan = PLANS[planKey];

  document.getElementById('paypalPlanInfo').innerHTML = `
    <div class="text-center mb-2">
      <div class="text-4xl mb-2">${plan.emoji}</div>
      <h3 class="syne text-2xl font-black" style="color:${plan.color}">${plan.name}</h3>
      <p class="text-3xl font-black mt-1">${plan.price}</p>
      <p class="text-sm text-gray-500 mt-2">${plan.desc}</p>
    </div>`;

  document.getElementById('paypal-button-container').innerHTML = '';

  paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay' },
    createOrder: function(data, actions) {
      const priceMap = { traveler_plus: '9.00', trust_pass: '15.00', host_pro: '20.00' };
      return actions.order.create({
        purchase_units: [{
          description: 'RIDEALONG — ' + plan.name,
          amount: { value: priceMap[planKey], currency_code: 'USD' }
        }]
      });
    },
    onApprove: async function(data, actions) {
      const order = await actions.order.capture();
      await activatePlan(planKey, 'paypal', order.id);
      closeModal('paypal');
      showToast('🎉 ¡' + plan.name + ' activado!');
    },
    onError: function(err) {
      console.error('PayPal error:', err);
      showToast('❌ Error en el pago. Intentá de nuevo.');
    },
    onCancel: function() {
      showToast('⚠️ Pago cancelado');
    }
  }).render('#paypal-button-container');

  openModal('paypal');
}

async function activatePlan(planKey, provider, transactionId) {
  const daysMap = { traveler_plus: 30, trust_pass: 7, host_pro: 30 };
  const priceMap = { traveler_plus: 9, trust_pass: 15, host_pro: 20 };
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + daysMap[planKey]);

  await sb.from('subscriptions').insert({
    user_id: currentUser.id,
    plan: planKey,
    provider,
    provider_subscription_id: transactionId,
    amount: priceMap[planKey],
    currency: 'USD',
    expires_at: expiresAt.toISOString()
  });

  if (planKey === 'host_pro') {
    await sb.from('hosts').update({ plan: 'host_pro', plan_expires_at: expiresAt.toISOString() })
      .eq('user_id', currentUser.id);
  } else {
    await sb.from('profiles').update({ plan: planKey, plan_expires_at: expiresAt.toISOString() })
      .eq('id', currentUser.id);
  }
}

function handleLemonCash() {
  closeModal('paypal');
  showToast('🍋 Escribinos por WhatsApp para pagar con Lemon Cash');
  window.open('https://wa.me/5493794522749?text=Hola!%20Quiero%20activar%20' + encodeURIComponent(PLANS[activePlan]?.name || 'un plan') + '%20con%20Lemon%20Cash', '_blank');
}

function toggleMobileMenu() {
  document.getElementById('mobileMenu').classList.toggle('hidden');
}

function closeMobileMenu() {
  document.getElementById('mobileMenu').classList.add('hidden');
}

async function loadStats() {
  try {
    const { count: vans } = await sb.from('hosts').select('*', { count: 'exact', head: true }).eq('is_active', true);
    const { count: travelers } = await sb.from('profiles').select('*', { count: 'exact', head: true });
    const { data: countries } = await sb.from('hosts').select('country').eq('is_active', true);
    const uniqueCountries = new Set(countries?.map(h => h.country)).size;
    document.getElementById('stat-vans').textContent = (vans || 0) + '+';
    document.getElementById('stat-travelers').textContent = (travelers || 0) + '+';
    document.getElementById('stat-countries').textContent = uniqueCountries || '0';
  } catch(e) {
    document.getElementById('stat-vans').textContent = '0';
    document.getElementById('stat-travelers').textContent = '0';
    document.getElementById('stat-countries').textContent = '0';
  }
}

function previewPhotos(input) {
  const preview = document.getElementById('photoPreview');
  preview.innerHTML = '';
  Array.from(input.files).slice(0, 5).forEach(file => {
    const url = URL.createObjectURL(file);
    preview.insertAdjacentHTML('beforeend', `<img src="${url}" class="w-16 h-16 rounded-xl object-cover border-2 border-orange-300">`);
  });
}

async function uploadHostPhotos(hostId, files) {
  const urls = [];
  for (const file of Array.from(files).slice(0, 5)) {
    const ext = file.name.split('.').pop();
    const path = `${hostId}/${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('van-photos').upload(path, file, { upsert: true });
    if (!error) {
      const { data } = sb.storage.from('van-photos').getPublicUrl(path);
      urls.push(data.publicUrl);
    }
  }
  if (urls.length > 0) {
    await sb.from('host_photos').insert(urls.map((url, i) => ({ host_id: hostId, url, is_cover: i === 0 })));
  }
  return urls;
}

async function handleAdvertiseForm() {
  const name = document.getElementById('adv-name').value.trim();
  const brand = document.getElementById('adv-brand').value.trim();
  const email = document.getElementById('adv-email').value.trim();
  const country = document.getElementById('adv-country').value;
  const category = document.getElementById('adv-category').value;
  const message = document.getElementById('adv-message').value.trim();
  if (!name || !email) return showToast('❌ Nombre y email requeridos');
  const subject = encodeURIComponent(`[RIDEALONG Publicidad] ${brand || name} - ${category}`);
  const body = encodeURIComponent(`Nombre: ${name}\nEmpresa: ${brand}\nEmail: ${email}\nPaís: ${country}\nRubro: ${category}\nMensaje: ${message}`);
  window.location.href = `mailto:ridealong61@yahoo.com?subject=${subject}&body=${body}`;
  showToast('📨 ¡Consulta enviada!');
  ['adv-name','adv-brand','adv-email','adv-message'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
}

function tagLabel(tag) {
  const map = { pet_friendly: '🐾 Pet friendly', insured: '🛡️ Con seguro', women_only: '👩 Solo mujeres', coastal_route: '🌊 Costera', off_grid: '⛺ Off-grid', verified: '✅ Verificado', solar: '☀️ Solar', kitchen: '🍳 Cocina', shower: '🚿 Ducha', wifi: '📶 WiFi' };
  return `<span class="badge" style="background:#FFF3E0;color:#E65100">${map[tag] || tag}</span>`;
}

function countryName(code) {
  const map = { ar: 'Argentina 🇦🇷', cl: 'Chile 🇨🇱', mx: 'México 🇲🇽', co: 'Colombia 🇨🇴', pe: 'Perú 🇵🇪', br: 'Brasil 🇧🇷', uy: 'Uruguay 🇺🇾', us: 'USA 🇺🇸', ca: 'Canada 🇨🇦', es: 'España 🇪🇸', pt: 'Portugal 🇵🇹', nz: 'New Zealand 🇳🇿', au: 'Australia 🇦🇺', za: 'South Africa 🇿🇦', other: '🌍' };
  return map[code] || code || '';
}
