/*
 * Opsætningssiden til Radar.exe.
 *
 * Siden spørger serveren, hvad der sker (/api/opsaetning/info), og viser en af tre
 * visninger: vælg centrum, gør klar (kortet hentes) eller klar (QR-kode og knapper).
 * Ingen biblioteker ud over Leaflet til kortet.
 */

(() => {
  const $ = (id) => document.getElementById(id);
  const visninger = ['opsaetning', 'arbejder', 'klar'];

  let nuvaerende = '';
  let koordinat = null;
  let marker = null;
  let kort = null;
  let stoppet = false;

  // ---------------------------------------------------------------- koordinat

  /** Samme regler som serveren: to tal, decimalkomma og blanke er i orden. */
  const tolk = (tekst) => {
    const normal = tekst.includes('.') ? tekst : tekst.replace(/(\d),(\d)/g, '$1.$2');
    const tal = (normal.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (tal.length !== 2) return null;
    const [lat, lon] = tal;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  };

  const saetKoordinat = (k, fraTekst) => {
    koordinat = k;
    $('opret').disabled = !k;
    if (!k) {
      $('koordinattjek').textContent = $('koordinat').value ? 'Det kan jeg ikke læse som et koordinat.' : '';
      return;
    }
    $('koordinattjek').textContent = `Valgt: ${k.lat.toFixed(6)}, ${k.lon.toFixed(6)}`;
    if (!fraTekst) $('koordinat').value = `${k.lat.toFixed(6)}, ${k.lon.toFixed(6)}`;
    if (kort) {
      if (marker) marker.setLatLng([k.lat, k.lon]);
      else marker = L.marker([k.lat, k.lon]).addTo(kort);
      if (fraTekst) kort.setView([k.lat, k.lon], Math.max(kort.getZoom(), 13));
    }
  };

  // ---------------------------------------------------------------- kort

  const lavKort = () => {
    if (kort || typeof L === 'undefined') return;
    L.Icon.Default.imagePath = 'leaflet/images/';
    kort = L.map('kort', { center: [56, 10.5], zoom: 7 });
    let fejl = 0;
    const lag = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap',
    }).addTo(kort);
    lag.on('tileerror', () => {
      fejl += 1;
      if (fejl > 2) $('kortnote').hidden = false;
    });
    kort.on('click', (e) => saetKoordinat({ lat: e.latlng.lat, lon: e.latlng.lng }, false));
    setTimeout(() => kort.invalidateSize(), 100);
  };

  // ---------------------------------------------------------------- visninger

  const vis = (navn) => {
    if (navn === nuvaerende) return;
    nuvaerende = navn;
    for (const v of visninger) $(v).hidden = v !== navn;
    if (navn === 'opsaetning') lavKort();
  };

  const tegn = (info) => {
    $('forbinder').hidden = true;
    vis(info.tilstand);

    if (info.tilstand === 'opsaetning') {
      $('fejl').hidden = !info.fejl;
      $('fejl').textContent = info.fejl || '';
      $('fortsaet').hidden = !info.kanFortsaette;
      $('opret').disabled = !koordinat;
    }

    if (info.tilstand === 'arbejder') {
      const p = info.fremdrift ?? 0;
      $('bjaelke').style.width = `${p}%`;
      $('procent').textContent = String(Math.round(p));
      $('besked').textContent = info.besked || '';
    }

    if (info.tilstand === 'klar') {
      const admin = info.admin;
      const link = admin && admin.links[0];
      $('qr').innerHTML = admin && admin.qrSvg ? admin.qrSvg : '';
      $('qr').hidden = !(admin && admin.qrSvg);
      $('uden-net').hidden = Boolean(link);
      $('link').textContent = link || '';
      $('link').href = link || '#';
      $('kopier').hidden = !link;
      $('manglerkort').hidden = info.harKort;
    }
  };

  const hent = async () => {
    if (stoppet) return;
    try {
      const svar = await fetch('/api/opsaetning/info', { cache: 'no-store' });
      if (!svar.ok) throw new Error('svar');
      tegn(await svar.json());
    } catch {
      // Serveren skifter fra opsætning til drift: det tager et øjeblik.
      if (nuvaerende !== '') $('forbinder').hidden = false;
    }
  };

  // ---------------------------------------------------------------- handlinger

  const post = (sti, krop) =>
    fetch(sti, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(krop || {}),
    });

  $('koordinat').addEventListener('input', () => saetKoordinat(tolk($('koordinat').value), true));

  $('opret').addEventListener('click', async () => {
    if (!koordinat) return;
    $('opret').disabled = true;
    await post('/api/opsaetning/opret', { ...koordinat, navn: $('navn').value });
    hent();
  });

  $('fortsaet').addEventListener('click', async () => {
    await post('/api/opsaetning/fortsaet');
    hent();
  });

  $('skaerm').addEventListener('click', async () => {
    const svar = await post('/api/opsaetning/aabn-skaerm');
    const krop = await svar.json();
    if (!krop.aabnet) {
      alert('Fandt ikke Chrome eller Edge. Åbn http://localhost:' + location.port + '/ selv.');
    }
  });

  $('kopier').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('link').textContent);
      $('kopier').textContent = 'Kopieret';
    } catch {
      $('kopier').textContent = 'Markér og kopiér linket selv';
    }
  });

  $('nyt').addEventListener('click', async () => {
    if (!confirm('Vælge et nyt centrum? Radaren genstarter, og en igangværende nat nulstilles.')) return;
    const svar = await post('/api/opsaetning/nyt');
    if (!svar.ok) {
      alert('Luk radaren, og start Radar.exe igen med --nyt.');
      return;
    }
    nuvaerende = '';
    $('forbinder').hidden = false;
    // Siden skifter af sig selv til opsætning, når den nye proces er oppe.
  });

  $('stop').addEventListener('click', async () => {
    if (!confirm('Stop radaren? Skærmen og admin holder op med at virke.')) return;
    stoppet = true;
    await post('/api/opsaetning/stop').catch(() => undefined);
    for (const v of visninger) $(v).hidden = true;
    $('klar').hidden = false;
    for (const e of $('klar').children) if (e.id !== 'stoppet') e.hidden = true;
    $('stoppet').hidden = false;
  });

  hent();
  setInterval(hent, 1000);
})();
