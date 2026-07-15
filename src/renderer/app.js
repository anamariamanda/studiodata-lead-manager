const api = window.studioData;

const STATUSES = ['Nou', 'De analizat', 'Analizat', 'Contactat', 'Follow-up necesar', 'Răspuns primit', 'Interesat', 'Întâlnire programată', 'Ofertă trimisă', 'Negociere', 'Câștigat', 'Pierdut', 'Nu mai contacta'];
const PRIORITIES = ['Scăzută', 'Medie', 'Ridicată', 'Urgentă'];
const SOURCES = ['Google Maps', 'Facebook', 'LinkedIn', 'Recomandare', 'Email', 'Telefon', 'Website', 'Altă sursă'];
const ACTIVITY_TYPES = ['apel telefonic', 'email trimis', 'mesaj Facebook', 'mesaj LinkedIn', 'mesaj WhatsApp', 'întâlnire', 'ofertă trimisă', 'follow-up', 'notă internă'];
const CHECKLIST = [
  'website-ul funcționează', 'website-ul folosește HTTPS', 'website-ul este responsive', 'website-ul se afișează bine pe mobil',
  'website-ul se încarcă rapid', 'designul este modern', 'informațiile sunt actualizate', 'există formular de contact',
  'există buton clar de contact', 'există email profesional', 'există pagină de servicii', 'există recenzii sau testimoniale',
  'există politici GDPR', 'există politică de cookie-uri', 'există linkuri către rețelele sociale',
  'informațiile de contact sunt ușor de găsit', 'există adresă sau hartă', 'textele sunt clare',
  'imaginile sunt de calitate', 'există apeluri clare la acțiune'
];

let appInfo = {};
let currentPage = 'dashboard';
let currentLead = null;
let scraperResult = null;
let googleImportLeads = [];
let offerItems = [];

const $ = (selector) => document.querySelector(selector);
const app = $('#app');

document.addEventListener('DOMContentLoaded', init);

async function init() {
  appInfo = await api.init();
  bindShell();
  api.onMenuNavigate(showPage);
  api.onPrintLead(({ leadId }) => renderPrintableLead(leadId, false));
  api.onPrintAnalysis(({ leadId }) => renderPrintableLead(leadId, true));
  api.onPrintOffer(({ offerId }) => renderPrintableOffer(offerId));
  await showPage('dashboard');
}

function bindShell() {
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
  document.querySelectorAll('[data-page-jump]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.pageJump)));
  $('#refresh-btn').addEventListener('click', () => showPage(currentPage));
}

async function showPage(page, payload) {
  currentPage = page;
  document.querySelectorAll('nav button').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  const titles = {
    dashboard: ['Dashboard', 'Privire rapidă asupra lead-urilor și follow-up-urilor.'],
    leads: ['Lead-uri', 'Caută, filtrează și gestionează firmele găsite.'],
    importContacts: ['Import contacte', 'Alege un fișier RTF sau TXT și transformă-l automat în lead-uri.'],
    offers: ['Oferte', 'Creează, salvează și exportă oferte StudioData în PDF.'],
    studioProfile: ['Profil StudioData', 'Personalizează serviciile, tonul și mesajele generate de aplicație.'],
    scraper: ['Auditor website', 'Analizează website-uri publice și completează scorul lead-ului.'],
    add: ['Adaugă lead', 'Completează datele firmei, analiza website-ului și următorul pas.'],
    templates: ['Șabloane', 'Editează mesaje și generează texte cu variabile.'],
    followups: ['Follow-up', 'Calendar simplu pentru activitățile programate.'],
    backup: ['Backup', 'Import, export și copii locale de siguranță.'],
    settings: ['Setări', 'Preferințe, notificări, temă și locația bazei de date.'],
    help: ['Ajutor', 'Pași simpli pentru folosirea aplicației.']
  };
  $('#page-title').textContent = titles[page]?.[0] || 'StudioData Lead Manager';
  $('#page-subtitle').textContent = titles[page]?.[1] || '';
  if (page === 'dashboard') return renderDashboard();
  if (page === 'leads') return renderLeads();
  if (page === 'importContacts') return renderImportContacts();
  if (page === 'offers') return renderOffers(payload);
  if (page === 'studioProfile') return renderStudioProfile();
  if (page === 'scraper') return renderScraper();
  if (page === 'add') return renderLeadForm(payload?.id);
  if (page === 'templates') return renderTemplates();
  if (page === 'followups') return renderFollowups();
  if (page === 'backup') return renderBackup();
  if (page === 'settings') return renderSettings();
  return renderHelp();
}

function renderScraper() {
  setNotice('');
  app.innerHTML = `
    <div class="grid">
      <section class="panel scraper-panel">
        <h2>Din rezultate Google</h2>
        <form id="google-import-form" class="grid">
          <label>Copiază aici rezultatele din Google sau Google Maps
            <textarea name="results" class="large-textarea" placeholder="Exemplu: selectezi rezultatele din Google/Maps, copiezi și lipești aici. Aplicația extrage firme, telefoane, emailuri și website-uri când apar."></textarea>
          </label>
          <div class="toolbar">
            <button class="primary" type="submit">Extrage lead-uri</button>
            <button type="button" id="clear-google-import">Curăță</button>
          </div>
        </form>
        <div id="google-import-output" class="scraper-output">${googleImportLeads.length ? googleImportView(googleImportLeads) : '<div class="empty">Lipește rezultatele Google/Maps pentru import în masă.</div>'}</div>
      </section>

      <section class="panel scraper-panel">
        <h2>Auditor website individual</h2>
        <form id="scraper-form" class="scraper-form">
          <label>Website public
            <input name="url" placeholder="exemplu.ro sau https://exemplu.ro" autocomplete="url" required>
          </label>
          <button class="primary" type="submit">Auditează website</button>
        </form>
        <div id="scraper-output" class="scraper-output">${scraperResult ? scraperResultView(scraperResult) : '<div class="empty">Introdu un website și pornește auditul.</div>'}</div>
      </section>
    </div>`;
  $('#scraper-form').onsubmit = runScraper;
  $('#google-import-form').onsubmit = runGoogleImport;
  $('#clear-google-import').onclick = () => { googleImportLeads = []; renderScraper(); };
  bindScraperActions();
  bindGoogleImportActions();
}

async function runScraper(event) {
  event.preventDefault();
  const url = new FormData(event.currentTarget).get('url');
  const output = $('#scraper-output');
  scraperResult = null;
  output.innerHTML = '<div class="empty">Auditez website-ul...</div>';
  try {
    scraperResult = await api.scrapeWebsite(url);
    output.innerHTML = scraperResultView(scraperResult);
    bindScraperActions();
    toast('Audit finalizat.');
  } catch (error) {
    output.innerHTML = `<div class="empty">${esc(error.message || 'Nu am putut analiza website-ul.')}</div>`;
  }
}

function scraperResultView(result) {
  const lead = result.lead || {};
  const found = result.found || {};
  const checks = [
    ['HTTPS', found.hasHttps],
    ['Responsive', found.hasResponsive],
    ['Contact vizibil', found.hasContact],
    ['GDPR / cookies', found.hasCookie],
    ['Social media', Boolean(found.facebook || found.linkedin)]
  ];
  return `
    <div class="grid two scraper-results">
      <section class="panel">
        <h2>Date găsite</h2>
        <dl class="details">
          <dt>Firmă</dt><dd>${esc(lead.company)}</dd>
          <dt>Website</dt><dd>${esc(lead.website)}</dd>
          <dt>Email</dt><dd>${esc(lead.email || 'Nu am găsit')}</dd>
          <dt>Telefon</dt><dd>${esc(lead.phone || 'Nu am găsit')}</dd>
          <dt>Facebook</dt><dd>${esc(lead.facebook || 'Nu am găsit')}</dd>
          <dt>LinkedIn</dt><dd>${esc(lead.linkedin || 'Nu am găsit')}</dd>
        </dl>
        <div class="toolbar">
          <button class="primary" id="save-scraped-lead">Salvează ca lead</button>
          <button id="edit-scraped-lead">Deschide în formular</button>
        </div>
      </section>
      <section class="panel">
        <h2>Audit rapid</h2>
        <p><span class="score">${esc(found.score ?? '')}</span>/100 · ${scoreLabel(Number(found.score || 0))}</p>
        <div class="scraper-checks">${checks.map(([label, ok]) => `<span class="badge ${ok ? 'good' : 'warn'}">${ok ? '✓' : '!'} ${label}</span>`).join('')}</div>
        <p><strong>Titlu:</strong> ${esc(found.title || 'Nu am găsit')}</p>
        <p><strong>Descriere:</strong> ${esc(found.description || 'Nu am găsit')}</p>
        <p><strong>Emailuri:</strong> ${esc((found.emails || []).join(', ') || 'Nu am găsit')}</p>
        <p><strong>Telefoane:</strong> ${esc((found.phones || []).join(', ') || 'Nu am găsit')}</p>
      </section>
      <section class="panel brief-panel">
        <h2>Brief pentru client</h2>
        <p>${esc(found.clientBrief || lead.other_problems || 'Brieful va apărea după audit.').replace(/\n/g, '<br>')}</p>
      </section>
    </div>`;
}

function bindScraperActions() {
  $('#save-scraped-lead')?.addEventListener('click', async () => {
    if (!scraperResult?.lead) return;
    const saved = await api.saveLead(scraperResult.lead);
    toast('Lead salvat din scraper.');
    showPage('add', { id: saved.id });
  });
  $('#edit-scraped-lead')?.addEventListener('click', () => {
    if (!scraperResult?.lead) return;
    showScrapedLeadModal(scraperResult.lead);
  });
}

function runGoogleImport(event) {
  event.preventDefault();
  const text = new FormData(event.currentTarget).get('results');
  googleImportLeads = parseGoogleResults(text);
  $('#google-import-output').innerHTML = googleImportLeads.length ? googleImportView(googleImportLeads) : '<div class="empty">Nu am găsit lead-uri clare în textul lipit.</div>';
  bindGoogleImportActions();
  if (googleImportLeads.length) toast(`${googleImportLeads.length} lead-uri pregătite.`);
}

function parseGoogleResults(text = '') {
  const cleaned = String(text)
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' | ')
    .replace(/\u00a0/g, ' ')
    .replace(/[•·]/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  const rawBlocks = cleaned.split(/\n\s*\n/g).map(block => block.trim()).filter(Boolean);
  const lines = cleaned.split('\n').map(cleanGoogleLine).filter(Boolean);
  const websiteRegex = /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}(?:\/[^\s<>()]*)?/ig;
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
  const phoneRegex = /(?:\+40|0040|0)\s?(?:7\d{2}|2\d{2}|3\d{2})[\s.-]?\d{3}[\s.-]?\d{3}|\b07\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g;
  const chunks = rawBlocks.length > 1 ? rawBlocks.map(block => block.split('\n').map(cleanGoogleLine).filter(Boolean)) : splitGoogleLines(lines, websiteRegex, phoneRegex, emailRegex);
  const directRows = lines
    .filter(line => /[|,;]/.test(line) && (line.match(phoneRegex) || line.match(emailRegex) || line.match(websiteRegex)))
    .map(line => line.split(/\s*[|,;]\s*/).map(cleanGoogleLine).filter(Boolean));

  const leads = buildGoogleLeads([...directRows, ...chunks], websiteRegex, emailRegex, phoneRegex);
  if (!leads.length && lines.length) {
    return buildGoogleLeads([lines], websiteRegex, emailRegex, phoneRegex).slice(0, 80);
  }
  return leads.slice(0, 80);
}

function cleanGoogleLine(line = '') {
  return String(line)
    .replace(/\s+/g, ' ')
    .replace(/^[\-–—*•·\s]+/, '')
    .replace(/\s+$/, '')
    .trim();
}

function splitGoogleLines(lines, websiteRegex, phoneRegex, emailRegex) {
  const chunks = [];
  let current = [];
  for (const line of lines) {
    if (isGoogleNoiseLine(line)) continue;
    const hasContact = Boolean(line.match(phoneRegex) || line.match(emailRegex) || line.match(websiteRegex));
    const looksName = looksLikeCompanyName(line);
    const startsNew = current.length >= 2 && looksName && current.some(existing => existing.match(phoneRegex) || existing.match(emailRegex) || existing.match(websiteRegex));
    if (startsNew) {
      chunks.push(current);
      current = [];
    }
    current.push(line);
    if (hasContact && current.length >= 3 && nextChunkLikelyComplete(current)) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);
  return chunks.filter(chunk => chunk.length);
}

function nextChunkLikelyComplete(chunk) {
  const text = chunk.join(' ');
  return /(?:\+40|0040|0)\s?(?:7\d{2}|2\d{2}|3\d{2})/i.test(text) || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

function buildGoogleLeads(chunks, websiteRegex, emailRegex, phoneRegex) {
  const leads = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const joined = chunk.join(' ');
    const websites = [...new Set((joined.match(websiteRegex) || []).map(normalizeLooseWebsite).filter(Boolean))]
      .filter(url => !/google\.|gstatic\.|schema\.org|facebook\.com\/share|maps\.app\.goo\.gl|goo\.gl|g\.co/i.test(url));
    const emails = [...new Set(joined.match(emailRegex) || [])];
    const phones = [...new Set(joined.match(phoneRegex) || [])].map(phone => phone.replace(/\s+/g, ' ').trim());
    const company = guessCompanyName(chunk, websites[0], emails[0]);
    if (!company && !websites[0] && !phones[0] && !emails[0]) continue;
    const key = `${company}|${websites[0] || ''}|${phones[0] || ''}|${emails[0] || ''}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push({
      ...blankLead(),
      company: company || websites[0] || emails[0] || 'Lead din Google',
      phone: phones[0] || '',
      email: emails[0] || '',
      website: websites[0] || '',
      source: 'Google Maps',
      status: 'Nou',
      priority: websites[0] ? 'Medie' : 'Ridicată',
      main_problem: websites[0] ? 'Lead importat din rezultate Google. Necesită analiză website.' : 'Lead importat din rezultate Google fără website vizibil.',
      recommended_service: websites[0] ? 'Optimizare SEO / Website de prezentare' : 'Website de prezentare',
      notes: `Importat din rezultate Google/Maps.\n${chunk.slice(0, 8).join('\n')}`
    });
  }
  return leads;
}

function normalizeLooseWebsite(value = '') {
  let url = String(value).replace(/[),.;]+$/, '').trim();
  if (!url) return '';
  if (/^[\w.-]+\.[a-z]{2,}/i.test(url) && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (/^www\./i.test(url)) url = `https://${url}`;
  return url;
}

function guessCompanyName(lines, website, email) {
  const hostName = website ? website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].split('.')[0] : '';
  for (const line of lines) {
    if (isGoogleNoiseLine(line) || line.includes('@') || /^https?:\/\//i.test(line) || /^www\./i.test(line)) continue;
    if (line.length < 3 || line.length > 90) continue;
    if (/\b(?:\+40|0040|0)\s?(?:7\d{2}|2\d{2}|3\d{2})/i.test(line)) continue;
    if (/^\d+(?:[.,]\d+)?\s*(?:\(\d+\))?$/.test(line)) continue;
    if (/\b(?:SRL|S\.R\.L\.|SA|S\.A\.|PFA|cabinet|clinica|hotel|restaurant|service|studio|salon|construct|instal|medical|auto)\b/i.test(line)) return line;
    if (looksLikeCompanyName(line)) return line;
  }
  if (hostName) return hostName.replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  if (email) return email.split('@')[1].split('.')[0].replace(/[-_]/g, ' ');
  return '';
}

function looksLikeCompanyName(line = '') {
  if (isGoogleNoiseLine(line)) return false;
  if (line.length < 3 || line.length > 90) return false;
  if (/^\d/.test(line)) return false;
  if (/(?:strada|str\.|bulevard|bd\.|calea|județ|jud\.|românia|romania|deschis|închis|inchis|km de)/i.test(line)) return false;
  return /^[A-ZĂÂÎȘȚ0-9][\wĂÂÎȘȚăâîșț '&.,()/-]{2,90}$/.test(line);
}

function isGoogleNoiseLine(line = '') {
  return /^(website|site web|directions|indicații|indicatii|share|distribuie|call|apelează|apeleaza|telefon|email|contact|program|orar|deschis|închis|inchis|reviews?|recenzii|images?|imagini|harti|maps|google|sponsorizat|ad|anunț|anunt|mai multe|servicii|produse|salvează|salveaza|trimite pe telefon)$/i.test(line);
}

function googleImportView(leads) {
  return `
    <div class="toolbar import-summary">
      <strong>${leads.length} lead-uri găsite</strong>
      <button class="primary" id="save-google-leads">Salvează toate lead-urile</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Firmă</th><th>Telefon</th><th>Email</th><th>Website</th><th>Acțiuni</th></tr></thead>
        <tbody>${leads.map((lead, index) => `<tr>
          <td>${esc(lead.company)}</td>
          <td>${esc(lead.phone)}</td>
          <td>${esc(lead.email)}</td>
          <td>${esc(lead.website)}</td>
          <td><button data-save-google-lead="${index}">Salvează</button><button data-edit-google-lead="${index}">Editează</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function bindGoogleImportActions() {
  $('#save-google-leads')?.addEventListener('click', async () => {
    if (!googleImportLeads.length) return;
    for (const lead of googleImportLeads) await api.saveLead(lead);
    toast(`${googleImportLeads.length} lead-uri salvate.`);
    googleImportLeads = [];
    showPage('leads');
  });
  document.querySelectorAll('[data-save-google-lead]').forEach(button => button.addEventListener('click', async () => {
    const lead = googleImportLeads[Number(button.dataset.saveGoogleLead)];
    if (!lead) return;
    await api.saveLead(lead);
    toast('Lead salvat.');
  }));
  document.querySelectorAll('[data-edit-google-lead]').forEach(button => button.addEventListener('click', () => {
    const lead = googleImportLeads[Number(button.dataset.editGoogleLead)];
    if (lead) showScrapedLeadModal(lead);
  }));
}

function showScrapedLeadModal(lead) {
  currentLead = { ...blankLead(), ...lead };
  showPage('add').then(() => {
    Object.entries(lead).forEach(([key, value]) => {
      if (key === 'analysis_json') return;
      const field = document.querySelector(`[name="${key}"]`);
      if (field) field.value = value || '';
    });
    if (lead.analysis_json) {
      Object.entries(lead.analysis_json).forEach(([key, value]) => {
        const check = document.querySelector(`[data-check="${CSS.escape(key)}"]`);
        const note = document.querySelector(`[data-note="${CSS.escape(key)}"]`);
        if (check) check.checked = Boolean(value.checked);
        if (note) note.value = value.note || '';
      });
      updateScore();
    }
  });
}

async function renderDashboard() {
  const [data, leads] = await Promise.all([api.dashboard(), api.listLeads({ sortBy: 'created_at', sortDir: 'desc' })]);
  const notices = [];
  if (data.todayFollowups.length) notices.push(`${data.todayFollowups.length} follow-up-uri programate astăzi`);
  if (data.overdueFollowups.length) notices.push(`${data.overdueFollowups.length} follow-up-uri restante`);
  setNotice(notices.join(' • '));
  if (notices.length) api.notify(notices.join('. '));
  const contactedIds = new Set((data.recentActivities || []).filter(activity => activity.type === 'email trimis').map(activity => activity.lead_id));
  const readyForEmail = leads
    .filter(lead => lead.email && Number(lead.analysis_score || 0) > 0 && !contactedIds.has(lead.id) && !['Contactat', 'Nu mai contacta', 'Pierdut', 'Câștigat'].includes(lead.status))
    .slice(0, 5);
  const missingData = leads
    .filter(lead => !lead.email || !lead.phone || !lead.website)
    .slice(0, 5);
  const warmLeads = leads
    .filter(lead => ['Răspuns primit', 'Interesat', 'Întâlnire programată', 'Ofertă trimisă', 'Negociere'].includes(lead.status))
    .slice(0, 5);
  const cards = [
    ['Total lead-uri', data.cards.total], ['Noi', data.cards.new], ['De analizat', data.cards.toAnalyze], ['Contactate', data.cards.contacted],
    ['Follow-up necesar', data.cards.followupNeeded], ['Interesate', data.cards.interested], ['Oferte trimise', data.cards.offers], ['Câștigate', data.cards.won]
  ];
  app.innerHTML = `
    <div class="grid cards">${cards.map(([label, value]) => `<div class="card metric"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>
    <section class="panel focus-panel today-panel">
      <div class="section-heading">
        <div>
          <h2>Ce fac azi?</h2>
          <p class="muted">Cele mai utile acțiuni înainte să intri în lista completă.</p>
        </div>
        <button data-page-jump="leads">Vezi toate lead-urile</button>
      </div>
      <div class="daily-actions">
        ${actionBucket('Restante', data.overdueFollowups.slice(0, 4), 'Follow-up-uri trecute de termen.')}
        ${actionBucket('De contactat azi', data.todayFollowups.slice(0, 4), 'Lead-uri programate pentru astăzi.')}
        ${actionBucket('Gata de email', readyForEmail, 'Au audit și adresă de email.')}
        ${actionBucket('Lipsesc date', missingData, 'Merită completate înainte de contact.')}
        ${actionBucket('Oportunități calde', warmLeads, 'Au semnale de interes sau ofertă.')}
      </div>
    </section>
    <div class="grid two" style="margin-top:14px">
      ${listPanel('Follow-up-uri astăzi', data.todayFollowups)}
      ${listPanel('Follow-up-uri restante', data.overdueFollowups)}
      ${listPanel('Lead-uri adăugate recent', data.recentLeads)}
      ${activityPanel('Activități recente', data.recentActivities)}
      ${listPanel('Fără activitate de peste 7 zile', data.staleLeads)}
    </div>`;
  bindLeadLinks();
  document.querySelectorAll('[data-page-jump]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.pageJump)));
}

function actionBucket(title, leads, hint) {
  return `<div class="action-bucket">
    <div><strong>${esc(title)}</strong><span>${esc(hint)}</span></div>
    <div class="focus-list compact">
      ${leads.length ? leads.map(focusLead).join('') : '<div class="empty small">Nimic urgent.</div>'}
    </div>
  </div>`;
}

function focusLead(lead) {
  const date = [lead.next_followup_date, lead.next_followup_time].filter(Boolean).join(' ');
  return `<div class="focus-item">
    <div><strong>${esc(lead.company)}</strong><span>${esc(date || lead.status || '')}</span></div>
    <button data-open-lead="${lead.id}">Deschide</button>
  </div>`;
}

function listPanel(title, leads) {
  return `<section class="panel"><h2>${title}</h2>${leads.length ? leads.map(lead => `<p><button class="linklike" data-open-lead="${lead.id}">${esc(lead.company)}</button> <span class="muted">${esc(lead.next_followup_date || lead.city || lead.status || '')}</span></p>`).join('') : '<div class="empty">Nimic de afișat.</div>'}</section>`;
}

function activityPanel(title, rows) {
  return `<section class="panel"><h2>${title}</h2>${rows.length ? rows.map(row => `<p><strong>${esc(row.type)}</strong> · ${esc(row.company || '')}<br><span class="muted">${esc(row.date)} ${esc(row.time || '')}</span></p>`).join('') : '<div class="empty">Nu există activități încă.</div>'}</section>`;
}

async function renderLeads(filters = {}) {
  const leads = await api.listLeads(filters);
  setNotice('');
  app.innerHTML = `
    <section class="lead-search-panel">
      <label>Caută rapid în lead-uri
        <input id="lead-search" value="${escAttr(filters.search || '')}" placeholder="Firmă, contact, email, telefon, oraș sau website">
      </label>
    </section>
    <div class="filters">
      ${input('company', 'Firmă')} ${input('contactPerson', 'Contact')} ${input('email', 'Email')} ${input('phone', 'Telefon')}
      ${input('city', 'Oraș')} ${input('county', 'Județ')} ${input('industry', 'Domeniu')}
      ${select('status', 'Status', ['', ...STATUSES])} ${select('priority', 'Prioritate', ['', ...PRIORITIES])} ${select('source', 'Sursă', ['', ...SOURCES])}
      ${input('followupDate', 'Data follow-up', 'date')} ${select('sortBy', 'Sortare', ['created_at', 'company', 'status', 'priority', 'next_followup_date'])}
      <button id="apply-filters" class="primary">Aplică</button><button id="reset-filters">Resetează filtrele</button>
    </div>
    <div class="table-wrap"><table><thead><tr>
      <th>Firmă</th><th>Domeniu</th><th>Oraș</th><th>Contact</th><th>Telefon</th><th>Email</th><th>Website</th><th>Problemă</th><th>Status</th><th>Prioritate</th><th>Follow-up</th><th>Acțiuni</th>
    </tr></thead><tbody id="leads-tbody">${filteredLeads(leads, filters.search).map(leadRow).join('') || '<tr><td colspan="12" class="empty">Nu există lead-uri.</td></tr>'}</tbody></table></div>`;
  Object.entries(filters).forEach(([key, value]) => { const field = document.querySelector(`[name="${key}"]`); if (field) field.value = value; });
  $('#lead-search').oninput = event => {
    const visible = filteredLeads(leads, event.target.value);
    $('#leads-tbody').innerHTML = visible.map(leadRow).join('') || '<tr><td colspan="12" class="empty">Nu există lead-uri pentru căutarea asta.</td></tr>';
    bindLeadTable();
  };
  $('#apply-filters').onclick = () => renderLeads({ ...Object.fromEntries(new FormData(document.querySelector('.filters')).entries()), search: $('#lead-search').value });
  $('#reset-filters').onclick = () => renderLeads({});
  bindLeadTable();
}

function filteredLeads(leads, search = '') {
  const needle = String(search || '').trim().toLowerCase();
  if (!needle) return leads;
  return leads.filter(lead => [
    lead.company, lead.contact_person, lead.email, lead.phone, lead.city, lead.county,
    lead.industry, lead.website, lead.status, lead.priority, lead.main_problem
  ].some(value => String(value || '').toLowerCase().includes(needle)));
}

function leadRow(lead) {
  return `<tr>
    <td><button class="linklike" data-open-lead="${lead.id}">${esc(lead.company)}</button></td><td>${esc(lead.industry)}</td><td>${esc(lead.city)}</td>
    <td>${esc(lead.contact_person)}</td><td>${esc(lead.phone)}</td><td>${esc(lead.email)}</td>
    <td>${lead.website ? `<button data-url="${escAttr(lead.website)}">Deschide</button>` : ''}</td><td>${esc(lead.main_problem)}</td>
    <td>${badge(lead.status, 'status')}</td><td>${badge(lead.priority, 'priority')}</td><td>${esc(lead.next_followup_date || '')} ${esc(lead.next_followup_time || '')}</td>
    <td class="lead-actions-cell">
      <div class="lead-actions">
        <button class="action-chip primary-chip" title="Deschide lead" data-open-lead="${lead.id}">Deschide</button>
        <button class="action-chip" title="Marchează contactat" data-quick-action="${lead.id}:contacted">Contactat</button>
        <button class="action-chip send-chip" title="Trimite email direct" data-quick-action="${lead.id}:direct-email">Trimite</button>
        <button class="action-chip" title="Email pentru telefon" data-quick-action="${lead.id}:phone-email">Telefon</button>
        <details class="action-menu">
          <summary>Mai multe</summary>
          <div class="action-menu-list">
            <button data-quick-action="${lead.id}:edit">Editează</button>
            <button data-quick-action="${lead.id}:follow">Follow-up</button>
            <button data-quick-action="${lead.id}:copy-email">Copiază email</button>
            <button data-quick-action="${lead.id}:copy-phone">Copiază telefon</button>
            <button data-quick-action="${lead.id}:mail">Email pe Mac</button>
            <button data-quick-action="${lead.id}:whatsapp">WhatsApp</button>
            <button data-quick-action="${lead.id}:website">Website</button>
            <button data-quick-action="${lead.id}:facebook">Facebook</button>
            <button data-quick-action="${lead.id}:linkedin">LinkedIn</button>
            <button data-quick-action="${lead.id}:duplicate">Duplică</button>
            <button class="danger-text" data-quick-action="${lead.id}:delete">Șterge</button>
          </div>
        </details>
      </div>
    </td></tr>`;
}

async function renderLeadForm(id) {
  const lead = id ? await api.getLead(id) : blankLead();
  currentLead = lead;
  app.innerHTML = `
    <div class="lead-editor grid">
    <form id="lead-form" class="grid lead-form">
      <section class="panel lead-hero">
        <div class="section-heading">
          <div>
            <h2>Lead pe scurt</h2>
            <p class="muted">Completează doar datele pe care le ai acum. Poți salva și reveni mai târziu.</p>
          </div>
          <div class="toolbar">
            <button type="button" id="audit-current-website">Auditează website</button>
            <button class="primary" type="submit">Salvează lead</button>
          </div>
        </div>
        <div class="lead-form-section">
          <h3>Date esențiale</h3>
          <p class="muted">Firma și măcar o metodă de contact sunt suficiente pentru început.</p>
          <div class="grid three">${essentialLeadFields(lead)}</div>
        </div>
        <div class="lead-form-section">
          <h3>Următorul pas</h3>
          <p class="muted">Alege ce trebuie făcut mai departe, fără să încarci lead-ul cu detalii inutile.</p>
          <div class="grid four">${nextStepLeadFields(lead)}</div>
        </div>
      </section>
      <details class="panel">
        <summary>Context opțional</summary>
        <div class="details-content">
          <p class="muted">Pentru informații utile, dar care nu sunt obligatorii la primul contact.</p>
          <div class="grid three">${optionalLeadFields(lead)}</div>
        </div>
      </details>
      <details class="panel">
        <summary>Audit website <span id="score" class="score">${score(lead.analysis_json)}</span>/100 · <span id="score-label">${scoreLabel(score(lead.analysis_json))}</span></summary>
        <p class="muted">Checklist-ul se poate completa automat cu „Auditează website”. Îl poți ajusta manual dacă ai nevoie.</p>
        <div class="grid details-content">${analysisFields(lead.analysis_json)}</div>
      </details>
      <div class="toolbar bottom-actions">${id ? `<button type="button" id="export-lead">Export PDF lead</button><button type="button" id="export-analysis">Export PDF analiză</button>` : ''}</div>
    </form>
    <details class="panel" ${id ? 'open' : ''}><summary>Activități și notițe de contact</summary><div id="activities" class="details-content">${activityList(lead.activities || [])}</div>${id ? activityForm(id) : '<p class="muted">Salvează lead-ul înainte de a adăuga activități.</p>'}</details>
    </div>`;
  $('#lead-form').onsubmit = saveLeadFromForm;
  document.querySelectorAll('[data-check]').forEach(el => el.addEventListener('change', updateScore));
  $('#activity-form')?.addEventListener('submit', addActivity);
  $('#audit-current-website')?.addEventListener('click', auditCurrentLeadWebsite);
  $('#export-lead')?.addEventListener('click', () => api.exportLeadPdf(id));
  $('#export-analysis')?.addEventListener('click', () => api.exportAnalysisPdf(id));
}

function essentialLeadFields(lead) {
  const fields = [
    ['company', 'Firma*'], ['contact_person', 'Persoană de contact'], ['phone', 'Telefon'],
    ['email', 'Email', 'email'], ['website', 'Website'], ['city', 'Oraș'],
    ['notes', 'Observații simple', 'textarea']
  ];
  return fields.map(([name, label, type = 'text', options]) => field(name, label, lead[name], type, options)).join('');
}

function nextStepLeadFields(lead) {
  const fields = [
    ['status', 'Status', 'select', STATUSES], ['priority', 'Prioritate', 'select', PRIORITIES],
    ['next_followup_date', 'Follow-up', 'date'], ['next_followup_time', 'Ora', 'time']
  ];
  return fields.map(([name, label, type = 'text', options]) => field(name, label, lead[name], type, options)).join('');
}

function optionalLeadFields(lead) {
  const fields = [
    ['created_at', 'Data adăugării', 'date'], ['industry', 'Domeniu'], ['county', 'Județ'],
    ['contact_role', 'Funcția contactului'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'],
    ['source', 'Sursa lead-ului', 'select', SOURCES], ['main_problem', 'Observație principală'], ['other_problems', 'Brief / alte observații', 'textarea'],
    ['recommended_service', 'Serviciu recomandat'], ['estimated_budget', 'Buget estimat'],
    ['last_contact_date', 'Data ultimei contactări', 'date']
  ];
  return fields.map(([name, label, type = 'text', options]) => field(name, label, lead[name], type, options)).join('');
}

function analysisFields(analysis = {}) {
  return CHECKLIST.map(item => {
    const value = analysis[item] || { checked: false, note: '' };
    return `<div class="grid check-row"><input type="checkbox" data-check="${escAttr(item)}" ${value.checked ? 'checked' : ''}><label>${esc(item)}</label><input data-note="${escAttr(item)}" value="${escAttr(value.note || '')}" placeholder="Observații"></div>`;
  }).join('');
}

async function saveLeadFromForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const lead = Object.fromEntries(form.entries());
  lead.id = currentLead?.id;
  lead.analysis_json = collectAnalysis();
  if (!lead.company.trim()) return toast('Numele firmei este obligatoriu.');
  const saved = await api.saveLead(lead);
  toast('Lead salvat.');
  showPage('add', { id: saved.id });
}

async function auditCurrentLeadWebsite() {
  const websiteField = document.querySelector('[name="website"]');
  const website = websiteField?.value?.trim();
  if (!website) {
    toast('Completează website-ul înainte de audit.');
    websiteField?.focus();
    return;
  }
  const button = $('#audit-current-website');
  const originalText = button.textContent;
  button.textContent = 'Auditez...';
  button.disabled = true;
  try {
    const result = await api.scrapeWebsite(website);
    applyAuditToForm(result.lead || {});
    toast('Audit aplicat pe lead. Verifică și salvează.');
  } catch (error) {
    toast(error.message || 'Nu am putut audita website-ul.');
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
}

function applyAuditToForm(auditLead = {}) {
  const fieldMap = ['company', 'phone', 'email', 'website', 'facebook', 'linkedin', 'source', 'main_problem', 'other_problems', 'recommended_service'];
  fieldMap.forEach(key => {
    const field = document.querySelector(`[name="${key}"]`);
    if (field && auditLead[key] && !field.value.trim()) field.value = auditLead[key];
  });
  const notes = document.querySelector('[name="notes"]');
  if (notes && auditLead.notes) {
    notes.value = notes.value.trim() ? `${notes.value.trim()}\n\nAudit website:\n${auditLead.notes}` : auditLead.notes;
  }
  if (auditLead.analysis_json) {
    Object.entries(auditLead.analysis_json).forEach(([key, value]) => {
      const check = document.querySelector(`[data-check="${cssEsc(key)}"]`);
      const note = document.querySelector(`[data-note="${cssEsc(key)}"]`);
      if (check) check.checked = Boolean(value.checked);
      if (note) note.value = value.note || '';
    });
    updateScore();
  }
}

async function addActivity(event) {
  event.preventDefault();
  const activity = Object.fromEntries(new FormData(event.currentTarget).entries());
  activity.lead_id = currentLead.id;
  await api.addActivity(activity);
  toast('Activitate salvată.');
  showPage('add', { id: currentLead.id });
}

async function renderTemplates() {
  const [templates, leads] = await Promise.all([api.listTemplates(), api.listLeads({})]);
  app.innerHTML = `<div class="grid two"><section class="panel"><h2>Șabloane</h2><div class="grid">${templates.map(t => `<button data-template="${t.id}">${esc(t.name)}</button>`).join('')}</div></section><section class="panel" id="template-editor">${templateEditor(templates[0], leads)}</section></div>`;
  bindTemplateEditor(templates, leads);
}

const DEFAULT_OFFER_ITEMS = [
  { description: 'Dezvoltare website de prezentare - design personalizat, până la 6 pagini, responsive, formular de contact, optimizare tehnică, SEO de bază, publicare și 30 de zile de suport', quantity: 1, price: 4000 }
];

async function renderOffers(payload = {}) {
  const [offers, leads] = await Promise.all([api.listOffers(), api.listLeads({ sortBy: 'company', sortDir: 'asc' })]);
  const selected = payload?.id ? await api.getOffer(payload.id) : null;
  const offer = selected || {
    offer_number: `SD-${new Date().getFullYear()}-${String(offers.length + 1).padStart(3, '0')}`,
    issue_date: new Date().toISOString().slice(0, 10), valid_days: 15,
    title: 'Dezvoltare website de prezentare',
    objective: 'Crearea unei prezențe online clare și credibile, printr-un website modern care prezintă convingător compania, serviciile oferite și modalitățile de contact.',
    payment_terms: '40% la începerea proiectului\n40% după aprobarea variantei vizuale\n20% înainte de publicarea website-ului',
    delivery_term: '15-21 de zile lucrătoare de la primirea materialelor necesare și confirmarea începerii proiectului.',
    conditions: 'Oferta include două runde de ajustări pentru varianta vizuală și conținutul introdus.\n\nClientul va furniza logo-ul, textele, imaginile și datele de contact necesare.\n\nCosturile pentru domeniu, găzduire, servicii externe sau licențe comerciale nu sunt incluse.\n\nOrice funcționalitate care nu este prevăzută în ofertă va fi analizată și estimată înainte de implementare.',
    discount: 0, status: 'Ciornă', items: DEFAULT_OFFER_ITEMS
  };
  offerItems = (offer.items?.length ? offer.items : DEFAULT_OFFER_ITEMS).map(item => ({ ...item }));
  app.innerHTML = `<div class="offers-layout">
    <section class="panel offers-list no-print">
      <div class="section-heading"><div><h2>Oferte salvate</h2><p>${offers.length} documente</p></div><button id="new-offer">Ofertă nouă</button></div>
      <div class="offer-list-items">${offers.length ? offers.map(row => `<button class="offer-list-row ${row.id === offer.id ? 'active' : ''}" data-offer-open="${row.id}"><strong>${esc(row.offer_number)}</strong><span>${esc(row.client_name)}</span><small>${formatMoney(offerTotal(row))} · ${esc(row.status)}</small></button>`).join('') : '<div class="empty">Nu există oferte salvate.</div>'}</div>
    </section>
    <form id="offer-form" class="grid offer-editor no-print">
      <section class="panel"><div class="section-heading"><div><h2>${offer.id ? 'Editează oferta' : 'Ofertă nouă'}</h2><p>Toate câmpurile pot fi modificate.</p></div><span class="badge">${esc(offer.status)}</span></div>
        <input type="hidden" name="id" value="${offer.id || ''}">
        <div class="grid three">${field('offer_number', 'Număr ofertă', offer.offer_number)}${field('issue_date', 'Data emiterii', offer.issue_date, 'date')}${field('valid_days', 'Valabilitate (zile)', offer.valid_days, 'number')}</div>
        <label><span>Selectează lead</span><select id="offer-lead" name="lead_id"><option value="">Client introdus manual</option>${leads.map(lead => `<option value="${lead.id}" ${Number(offer.lead_id) === lead.id ? 'selected' : ''}>${esc(lead.company)}</option>`).join('')}</select></label>
        <div class="grid three">${field('client_name', 'Denumirea clientului', offer.client_name)}${field('client_contact', 'Persoană de contact', offer.client_contact)}${field('client_email', 'Email', offer.client_email, 'email')}</div>
        ${field('title', 'Titlul proiectului', offer.title)}${field('objective', 'Obiectivul proiectului', offer.objective, 'textarea')}
      </section>
      <section class="panel"><div class="section-heading"><div><h2>Servicii și prețuri</h2><p>Adaugă sau elimină orice serviciu.</p></div><button type="button" id="add-offer-item">Adaugă serviciu</button></div><div id="offer-items"></div><div class="offer-totals"><label>Reducere (lei)<input name="discount" id="offer-discount" type="number" min="0" step="1" value="${Number(offer.discount || 0)}"></label><div><span>Total ofertă</span><strong id="offer-total"></strong></div></div></section>
      <section class="panel grid two"><div>${field('delivery_term', 'Termen estimat', offer.delivery_term, 'textarea')}${field('payment_terms', 'Modalitate de plată - fiecare tranșă pe un rând', offer.payment_terms, 'textarea')}</div><div>${field('conditions', 'Condiții de colaborare', offer.conditions, 'textarea')}${field('status', 'Stare', offer.status, 'select', ['Ciornă', 'Trimisă', 'Acceptată', 'Respinsă'])}</div></section>
      <div class="toolbar"><button class="primary" type="submit">Salvează oferta</button>${offer.id ? `<button type="button" id="export-offer">Exportă PDF</button><button type="button" id="preview-offer">Previzualizare</button><button type="button" class="danger" id="delete-offer">Șterge</button>` : ''}</div>
    </form>
  </div>`;
  renderOfferItems();
  document.querySelectorAll('[data-offer-open]').forEach(button => button.onclick = () => showPage('offers', { id: Number(button.dataset.offerOpen) }));
  $('#new-offer').onclick = () => showPage('offers');
  $('#offer-lead').onchange = () => {
    const lead = leads.find(row => String(row.id) === $('#offer-lead').value);
    if (!lead) return;
    $('[name="client_name"]').value = lead.company || '';
    $('[name="client_contact"]').value = lead.contact_person || '';
    $('[name="client_email"]').value = lead.email || '';
  };
  $('#add-offer-item').onclick = () => { offerItems.push({ description: '', quantity: 1, price: 0 }); renderOfferItems(); };
  $('#offer-discount').oninput = updateOfferTotal;
  $('#offer-form').onsubmit = async event => {
    event.preventDefault();
    syncOfferItems();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.id = data.id ? Number(data.id) : null; data.lead_id = data.lead_id ? Number(data.lead_id) : null; data.items = offerItems;
    const saved = await api.saveOffer(data);
    toast('Oferta a fost salvată.');
    showPage('offers', { id: saved.id });
  };
  $('#export-offer')?.addEventListener('click', async () => { const result = await api.exportOfferPdf(offer.id); if (!result.cancelled) toast('Oferta PDF a fost exportată.'); });
  $('#preview-offer')?.addEventListener('click', () => renderPrintableOffer(offer.id, true));
  $('#delete-offer')?.addEventListener('click', async () => { if (confirm('Ștergi această ofertă?')) { await api.deleteOffer(offer.id); toast('Oferta a fost ștearsă.'); showPage('offers'); } });
}

function renderOfferItems() {
  const container = $('#offer-items');
  container.innerHTML = offerItems.map((item, index) => `<div class="offer-item-row" data-offer-item="${index}"><label>Descriere<textarea data-item-description>${esc(item.description)}</textarea></label><label>Cantitate<input data-item-quantity type="number" min="1" value="${item.quantity}"></label><label>Preț<input data-item-price type="number" min="0" step="1" value="${item.price}"></label><button type="button" class="danger" data-remove-item="${index}">×</button></div>`).join('');
  container.querySelectorAll('input, textarea').forEach(input => input.oninput = () => { syncOfferItems(); updateOfferTotal(); });
  container.querySelectorAll('[data-remove-item]').forEach(button => button.onclick = () => { offerItems.splice(Number(button.dataset.removeItem), 1); renderOfferItems(); });
  updateOfferTotal();
}

function syncOfferItems() {
  document.querySelectorAll('[data-offer-item]').forEach((row, index) => {
    offerItems[index] = { description: row.querySelector('[data-item-description]').value, quantity: Number(row.querySelector('[data-item-quantity]').value || 1), price: Number(row.querySelector('[data-item-price]').value || 0) };
  });
}

function offerTotal(offer) { return Math.max(0, (offer.items || []).reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.price || 0), 0) - Number(offer.discount || 0)); }
function updateOfferTotal() { if ($('#offer-total')) $('#offer-total').textContent = formatMoney(Math.max(0, offerItems.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.price || 0), 0) - Number($('#offer-discount')?.value || 0))); }
function formatMoney(value) { return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(Number(value || 0)) + ' lei'; }

function templateEditor(template = { name: '', body: '' }, leads = []) {
  return `<h2>Editează șablon</h2><label>Nume<input id="template-name" value="${escAttr(template.name)}"></label><label>Text<textarea id="template-body">${esc(template.body)}</textarea></label><label>Lead selectat<select id="template-lead"><option value="">Fără lead</option>${leads.map(l => `<option value="${l.id}">${esc(l.company)}</option>`).join('')}</select></label><div class="toolbar"><button id="save-template" class="primary" data-id="${template.id || ''}">Salvează</button><button id="copy-template">Copiază mesajul</button><button id="phone-template">Pentru telefon</button><button id="mail-template">Deschide în Mail</button><button id="wa-template">Deschide în WhatsApp</button><button id="new-template">Salvează ca șablon nou</button></div><pre id="template-preview" class="panel"></pre>`;
}

function bindTemplateEditor(templates, leads) {
  let selected = templates[0] || { name: '', body: '' };
  const refresh = () => {
    const lead = leads.find(l => String(l.id) === $('#template-lead').value);
    $('#template-preview').textContent = applyTemplate($('#template-body').value, lead);
  };
  document.querySelectorAll('[data-template]').forEach(btn => btn.onclick = () => {
    selected = templates.find(t => String(t.id) === btn.dataset.template);
    $('#template-editor').innerHTML = templateEditor(selected, leads);
    bindTemplateEditor(templates, leads);
  });
  $('#template-body').oninput = refresh; $('#template-lead').onchange = refresh; refresh();
  $('#save-template').onclick = async () => { await api.saveTemplate({ id: selected.id, name: $('#template-name').value, body: $('#template-body').value }); toast('Șablon salvat.'); renderTemplates(); };
  $('#new-template').onclick = async () => { await api.saveTemplate({ name: `${$('#template-name').value} nou`, body: $('#template-body').value }); toast('Șablon nou salvat.'); renderTemplates(); };
  $('#copy-template').onclick = () => api.copyText($('#template-preview').textContent).then(() => toast('Mesaj copiat.'));
  $('#mail-template').onclick = async () => {
    const lead = leads.find(l => String(l.id) === $('#template-lead').value);
    const opened = await api.openExternal(composeMailTo(lead, $('#template-preview').textContent));
    toast(opened ? 'Mesaj deschis în aplicația de email.' : 'Nu am putut deschide aplicația de email.');
  };
  $('#phone-template').onclick = async () => {
    const lead = leads.find(l => String(l.id) === $('#template-lead').value);
    showPhoneEmail(lead, $('#template-preview').textContent);
  };
  $('#wa-template').onclick = () => api.openExternal(`https://wa.me/?text=${encodeURIComponent($('#template-preview').textContent)}`);
}

async function renderFollowups() {
  const data = await api.dashboard();
  app.innerHTML = `<div class="grid two">${listPanel('Astăzi', data.todayFollowups)}${listPanel('Restante', data.overdueFollowups)}${listPanel('Următoare', (await api.listLeads({ sortBy: 'next_followup_date', sortDir: 'asc' })).filter(l => l.next_followup_date).slice(0, 20))}</div>`;
  bindLeadLinks();
}

function renderImportContacts() {
  setNotice('');
  app.innerHTML = `<section class="panel import-contacts-panel">
    <div class="section-heading">
      <div>
        <h2>Import contacte din fișier</h2>
        <p class="muted">Pentru liste simple cu nume, email și firmă. Acceptă fișiere .rtf și .txt.</p>
      </div>
    </div>
    <div class="import-drop">
      <strong>Importă lista ta de contacte</strong>
      <p>Alege fișierul, iar aplicația creează automat lead-uri cu firmă, persoană de contact și email.</p>
      <button class="primary" id="import-contacts-main">Alege fișier RTF/TXT</button>
    </div>
  </section>`;
  $('#import-contacts-main').onclick = () => openAndImportContacts();
}

function defaultStudioProfile(settings = {}) {
  return {
    studioServices: settings.studioServices || 'Website de prezentare modern\nRedesign website existent\nOptimizare SEO de bază\nStructură pentru cereri de ofertă și contact\nTexte clare pentru pagini de servicii\nGDPR, cookies și elemente de încredere\nMentenanță și actualizări website',
    studioDifferentiators: settings.studioDifferentiators || 'Explicăm clar ce poate fi îmbunătățit, fără termeni complicați.\nPropunem pași practici, nu doar observații generale.\nConstruim website-uri care ajută clientul să înțeleagă rapid oferta și să ceară detalii.\nPăstrăm comunicarea simplă, caldă și orientată spre rezultat.',
    studioTone: settings.studioTone || 'cald, clar, profesionist, fără presiune',
    studioSignature: settings.studioSignature || 'Cu drag,\nStudioData.ro\ncontact@studiodata.ro\n0774 771 443\nstudiodata.ro',
    studioPortfolioUrl: settings.studioPortfolioUrl || 'https://studiodata.ro',
    studioOfferIntro: settings.studioOfferIntro || 'Ne uităm la website ca la un instrument de încredere și contact, nu doar ca la o prezență online. Scopul este ca vizitatorul să înțeleagă rapid ce oferă firma și să poată cere ușor detalii.'
  };
}

async function renderStudioProfile() {
  const settings = await api.getSettings();
  const profile = defaultStudioProfile(settings);
  app.innerHTML = `<form id="studio-profile-form" class="grid">
    <section class="panel">
      <div class="section-heading">
        <div><h2>Profil StudioData</h2><p class="muted">Aceste informații vor ghida emailurile, briefurile și ofertele generate.</p></div>
        <button class="primary" type="submit">Salvează profilul</button>
      </div>
      <div class="grid two">
        ${field('studioTone', 'Tonul comunicării', profile.studioTone)}
        ${field('studioPortfolioUrl', 'Link portofoliu / website', profile.studioPortfolioUrl)}
      </div>
    </section>
    <section class="panel grid two">
      ${field('studioServices', 'Servicii StudioData', profile.studioServices, 'textarea')}
      ${field('studioDifferentiators', 'Ce ne diferențiază', profile.studioDifferentiators, 'textarea')}
      ${field('studioOfferIntro', 'Ideea principală pentru propuneri', profile.studioOfferIntro, 'textarea')}
      ${field('studioSignature', 'Semnătură email', profile.studioSignature, 'textarea')}
    </section>
    <section class="panel">
      <h2>Preview mesaj</h2>
      <pre class="profile-preview">${esc(composeDefaultEmailBody({
        company: 'Firma Exemplu',
        contact_person: 'Andreea',
        website: 'https://exemplu.ro',
        other_problems: 'Site-ul este prezent online, dar poate ghida mai clar vizitatorul către cerere de ofertă.\nAr ajuta mai multă încredere: recenzii, servicii explicate simplu și butoane de contact vizibile.',
        recommended_service: 'Website de prezentare / Optimizare SEO',
        analysis_score: 58
      }, 'warm', profile))}</pre>
    </section>
  </form>`;
  $('#studio-profile-form').onsubmit = async event => {
    event.preventDefault();
    await api.saveSettings(Object.fromEntries(new FormData(event.currentTarget).entries()));
    toast('Profil StudioData salvat.');
    renderStudioProfile();
  };
}

async function renderBackup() {
  app.innerHTML = `<div class="grid two">
    <section class="panel"><h2>Export</h2><div class="grid"><button id="export-csv">Export lead-uri CSV</button><button id="export-json">Export backup complet JSON</button><button id="auto-backup">Creează backup în folderul setat</button></div></section>
    <section class="panel"><h2>Import</h2><div class="grid"><button id="import-contacts">Import listă RTF/TXT</button><button id="import-csv">Import lead-uri CSV</button><button id="import-json">Restaurare backup JSON</button><p class="muted">Pentru liste simple cu nume, email și firmă folosește importul RTF/TXT.</p><p class="muted">Înainte de restaurare se creează automat un backup de siguranță.</p></div></section>
  </div>`;
  $('#export-csv').onclick = async () => saveAs('lead-uri.csv', [{ name: 'CSV', extensions: ['csv'] }], api.exportCsv);
  $('#export-json').onclick = async () => saveAs(`studiodata-backup-${new Date().toISOString().slice(0,10)}.json`, [{ name: 'JSON', extensions: ['json'] }], api.exportJson);
  $('#auto-backup').onclick = async () => { const result = await api.automaticBackup(); toast(`Backup creat: ${result.targetPath}`); };
  $('#import-contacts').onclick = () => openAndImportContacts();
  $('#import-csv').onclick = () => openAndImport([{ name: 'CSV', extensions: ['csv'] }], api.importCsv);
  $('#import-json').onclick = async () => { if (confirm('Restaurarea va înlocui datele curente. Continui?')) openAndImport([{ name: 'JSON', extensions: ['json'] }], api.importJson); };
}

async function openAndImportContacts() {
  const res = await api.openFileDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Liste contacte', extensions: ['rtf', 'txt'] },
      { name: 'Toate fișierele', extensions: ['*'] }
    ]
  });
  if (res.canceled) return;
  const result = await api.importContacts(res.filePaths[0]);
  toast(`${result.imported} lead-uri importate.`);
  showPage('leads');
}

async function renderSettings() {
  const [settings, emailSettings] = await Promise.all([api.getSettings(), api.getEmailSettings()]);
  app.innerHTML = `<div class="grid">
  <form id="settings-form" class="grid two">
    <section class="panel"><h2>Profil</h2>${field('userName', 'Numele utilizatorului', settings.userName)}${field('businessName', 'Numele afacerii', settings.businessName || 'StudioData.ro')}${field('ownEmail', 'Emailul propriu', settings.ownEmail)}${field('ownPhone', 'Telefonul propriu', settings.ownPhone)}${field('ownWebsite', 'Website-ul propriu', settings.ownWebsite)}</section>
    <section class="panel"><h2>Aplicație</h2>${field('backupFolder', 'Folder backup', settings.backupFolder)}<button type="button" id="choose-backup">Alege folder backup</button>${field('notifications', 'Notificări', settings.notifications || 'true', 'select', ['true', 'false'])}${field('backupFrequency', 'Frecvență backup', settings.backupFrequency || 'manual', 'select', ['manual', 'daily', 'weekly', 'on-close'])}${field('theme', 'Temă', settings.theme || 'system', 'select', ['system', 'light', 'dark'])}<p class="muted">Baza de date: ${esc(appInfo.dbPath)}</p><button type="button" id="open-data">Deschide folderul datelor</button><button type="button" class="danger" id="reset-app">Resetarea aplicației</button></section>
    <button class="primary" type="submit">Salvează setările</button>
  </form>
  <form id="email-settings-form" class="panel grid three">
    <div class="section-heading" style="grid-column:1/-1"><div><h2>Email direct</h2><p class="muted">Trimitem cu autentificare smtp@studiodata.ro, iar clientul vede contact@studiodata.ro ca expeditor.</p></div><span class="badge">${emailSettings.hasPassword ? 'Parolă salvată' : 'Neconfigurat'}</span></div>
    ${field('fromName', 'Nume expeditor', emailSettings.fromName)}
    ${field('fromEmail', 'Email expeditor vizibil', emailSettings.fromEmail || 'contact@studiodata.ro', 'email')}
    ${field('user', 'Utilizator SMTP', emailSettings.user || 'smtp@studiodata.ro')}
    ${field('host', 'Server SMTP', emailSettings.host)}
    ${field('port', 'Port', emailSettings.port || '465')}
    ${field('secure', 'Conexiune sigură', emailSettings.secure || 'true', 'select', ['true', 'false'])}
    ${field('password', emailSettings.hasPassword ? 'Parolă SMTP nouă (opțional)' : 'Parolă SMTP', '', 'password')}
    <div class="toolbar" style="grid-column:1/-1"><button class="primary" type="submit">Salvează email direct</button><button type="button" id="test-email-settings">Testează email direct</button></div>
  </form>
  </div>`;
  $('#choose-backup').onclick = async () => { const res = await api.openDirectoryDialog({ title: 'Alege folderul de backup' }); if (!res.canceled) $('[name="backupFolder"]').value = res.filePaths[0]; };
  $('#open-data').onclick = () => api.openDataFolder();
  $('#reset-app').onclick = () => alert('Pentru siguranță, resetarea completă se face prin restaurarea unui backup sau ștergerea manuală a bazei de date din folderul datelor.');
  $('#settings-form').onsubmit = async e => { e.preventDefault(); await api.saveSettings(Object.fromEntries(new FormData(e.currentTarget).entries())); toast('Setări salvate.'); };
  $('#email-settings-form').onsubmit = async e => { e.preventDefault(); await api.saveEmailSettings(Object.fromEntries(new FormData(e.currentTarget).entries())); toast('Setări email salvate.'); renderSettings(); };
  $('#test-email-settings').onclick = async () => {
    const button = $('#test-email-settings');
    button.disabled = true;
    button.textContent = 'Testez...';
    try {
      await api.testEmailSettings();
      toast('Conexiunea SMTP funcționează.');
    } catch (error) {
      showErrorModal('Test email direct', error.message || 'Testul SMTP a eșuat.');
    } finally {
      button.disabled = false;
      button.textContent = 'Testează email direct';
    }
  };
}

function renderHelp() {
  setNotice('');
  app.innerHTML = `<section class="panel"><h2>Bun venit</h2><ol><li>Adaugă primul lead.</li><li>Completează analiza website-ului.</li><li>Salvează datele de contact.</li><li>Programează un follow-up.</li><li>Folosește un șablon de mesaj.</li><li>Creează periodic un backup.</li></ol><p>Datele sunt salvate local în folderul standard al utilizatorului macOS: ${esc(appInfo.userDataPath)}.</p></section>`;
}

function bindLeadTable() {
  bindLeadLinks();
  document.querySelectorAll('[data-quick-action]').forEach(button => button.addEventListener('click', async () => {
    const [idValue, action] = button.dataset.quickAction.split(':');
    const id = Number(idValue);
    if (!action) return;
    button.closest('.action-menu')?.removeAttribute('open');
    await runLeadAction(id, action);
  }));
}

async function runLeadAction(id, action) {
  const lead = await api.getLead(id);
  if (!lead) return toast('Lead-ul nu mai există.');
  if (action === 'edit' || action === 'follow') return showPage('add', { id });
  if (action === 'contacted') return markContacted(id);
  if (action === 'copy-email') return api.copyText(lead.email || '').then(() => toast('Email copiat.'));
  if (action === 'copy-phone') return api.copyText(lead.phone || '').then(() => toast('Telefon copiat.'));
  if (action === 'mail') {
    const opened = await api.openExternal(composeMailTo(lead));
    return toast(opened ? 'Mesaj deschis în aplicația de email.' : 'Nu am putut deschide aplicația de email.');
  }
  if (action === 'direct-email') return showDirectEmail(lead);
  if (action === 'phone-email') return showPhoneEmail(lead);
  if (action === 'whatsapp') return api.openExternal(`https://wa.me/${(lead.phone || '').replace(/\D/g, '')}`);
  if (action === 'website') return api.openExternal(lead.website || '');
  if (action === 'facebook') return api.openExternal(lead.facebook || '');
  if (action === 'linkedin') return api.openExternal(lead.linkedin || '');
  if (action === 'duplicate') {
    await api.duplicateLead(id);
    toast('Lead duplicat.');
    return renderLeads();
  }
  if (action === 'delete' && confirm('Ștergi acest lead?')) {
    await api.deleteLead(id);
    toast('Lead șters.');
    return renderLeads();
  }
}

function bindLeadLinks() {
  document.querySelectorAll('[data-open-lead]').forEach(b => b.onclick = () => showPage('add', { id: Number(b.dataset.openLead) }));
}

async function markContacted(id) {
  const lead = await api.getLead(id);
  lead.status = 'Contactat';
  lead.last_contact_date = new Date().toISOString().slice(0, 10);
  await api.saveLead(lead);
  await api.addActivity({ lead_id: id, type: 'email trimis', date: lead.last_contact_date, description: 'Marcat drept contactat.' });
  toast('Lead marcat drept contactat.');
  renderLeads();
}

function activityList(rows) {
  return rows.length ? rows.map(row => `<p><strong>${esc(row.type)}</strong> · ${esc(row.date)} ${esc(row.time || '')}<br>${esc(row.description || '')}<br><span class="muted">${esc(row.result || '')} ${esc(row.next_step || '')}</span></p>`).join('') : '<div class="empty">Nu există activități.</div>';
}

function activityForm(id) {
  return `<form id="activity-form" class="grid three">${field('type', 'Tip activitate', 'follow-up', 'select', ACTIVITY_TYPES)}${field('date', 'Data', new Date().toISOString().slice(0,10), 'date')}${field('time', 'Ora', '', 'time')}${field('description', 'Descriere', '', 'textarea')}${field('result', 'Rezultat')}${field('next_step', 'Următorul pas')}<button class="primary">Adaugă activitate</button></form>`;
}

function blankLead() {
  return { created_at: new Date().toISOString().slice(0,10), status: 'Nou', priority: 'Medie', source: 'Google Maps', analysis_json: Object.fromEntries(CHECKLIST.map(item => [item, { checked: false, note: '' }])) };
}

function collectAnalysis() {
  return Object.fromEntries(CHECKLIST.map(item => [item, { checked: document.querySelector(`[data-check="${cssEsc(item)}"]`).checked, note: document.querySelector(`[data-note="${cssEsc(item)}"]`).value }]));
}

function updateScore() {
  const value = score(collectAnalysis());
  $('#score').textContent = value;
  $('#score-label').textContent = scoreLabel(value);
}

function score(analysis = {}) { return Math.round((Object.values(analysis).filter(v => v.checked).length / CHECKLIST.length) * 100); }
function scoreLabel(value) { return value < 40 ? 'Necesită îmbunătățiri majore' : value < 60 ? 'Slab' : value < 80 ? 'Acceptabil' : 'Bun'; }
function badge(value, type) { return `<span class="badge ${type}-${escAttr(String(value).split(' ')[0])}">${esc(value)}</span>`; }
function input(name, label, type = 'text') { return `<label><span>${label}</span><input name="${name}" type="${type}"></label>`; }
function select(name, label, options) { return `<label><span>${label}</span><select name="${name}">${options.map(o => `<option value="${escAttr(o)}">${esc(o || 'Toate')}</option>`).join('')}</select></label>`; }
function field(name, label, value = '', type = 'text', options = []) {
  if (type === 'textarea') return `<label><span>${label}</span><textarea name="${name}">${esc(value)}</textarea></label>`;
  if (type === 'select') return `<label><span>${label}</span><select name="${name}">${options.map(o => `<option value="${escAttr(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  return `<label><span>${label}</span><input name="${name}" type="${type}" value="${escAttr(value)}"></label>`;
}

function applyTemplate(text, lead = {}) {
  const vars = { firma: lead.company, persoana_contact: lead.contact_person, website: lead.website, oras: lead.city, problema: lead.main_problem, serviciu: lead.recommended_service, scor_website: lead.analysis_score, brief_site: lead.other_problems || lead.notes };
  return String(text).replace(/\{(\w+)\}/g, (_, key) => vars[key] || '');
}

function defaultEmailSubject(lead = {}) {
  return lead?.company ? `Observație despre site-ul ${lead.company}` : 'Observație despre site';
}

function composeMailTo(lead = {}, body = '') {
  const recipient = String(lead?.email || '').trim();
  const subject = defaultEmailSubject(lead);
  const params = new URLSearchParams();
  params.set('subject', subject);
  if (body) params.set('body', body);
  return `mailto:${encodeURIComponent(recipient)}?${params.toString()}`;
}

function composePlainEmail(lead = {}, body = '') {
  const recipient = String(lead?.email || '').trim();
  const subject = defaultEmailSubject(lead);
  return `Către: ${recipient}\nSubiect: ${subject}\n\n${body}`;
}

function briefBullets(lead = {}) {
  const source = String(lead.other_problems || lead.notes || lead.main_problem || '')
    .split(/\n+/)
    .map(line => line.replace(/^[-•\s]+/, '').trim())
    .filter(line => line && !/^Brief pentru/i.test(line) && !/^Audit automat/i.test(line) && !/^Scor estimat/i.test(line))
    .slice(0, 3);
  if (source.length) return source;
  const fallback = [];
  if (Number(lead.analysis_score || 0) > 0) fallback.push(`Scorul auditului rapid este ${lead.analysis_score}/100, deci există loc pentru câteva îmbunătățiri vizibile.`);
  if (lead.website) fallback.push('Website-ul poate fi analizat mai atent pentru claritate, încredere și contact mai ușor.');
  fallback.push('Putem identifica rapid ce ar merita ajustat ca vizitatorii să înțeleagă mai bine oferta și să ceară mai ușor detalii.');
  return fallback.slice(0, 3);
}

function suggestedServices(lead = {}, profile = {}) {
  const text = `${lead.main_problem || ''} ${lead.other_problems || ''} ${lead.recommended_service || ''}`.toLowerCase();
  const services = [];
  const configured = String(profile.studioServices || '').split(/\n+/).map(item => item.trim()).filter(Boolean);
  const pick = (pattern, fallback) => configured.find(item => pattern.test(item.toLowerCase())) || fallback;
  if (/website|site|prezentare|mobil|responsive|design/.test(text)) services.push(pick(/website|site|prezentare|redesign/, 'website de prezentare modern și ușor de folosit'));
  if (/seo|google|vizibil|căut|caut/.test(text)) services.push(pick(/seo|google|vizibil/, 'optimizare SEO de bază pentru vizibilitate mai bună în Google'));
  if (/contact|formular|cta|ofert|program/.test(text)) services.push(pick(/contact|ofert|formular|cereri/, 'structură mai clară pentru cereri de ofertă și contact'));
  if (/gdpr|cookie|confiden/.test(text)) services.push(pick(/gdpr|cookie|încredere|incredere/, 'actualizarea elementelor de încredere: GDPR, cookies și politici clare'));
  if (!services.length) services.push(configured[0] || 'audit și optimizare pentru claritate, încredere și conversii');
  return [...new Set(services)].slice(0, 3);
}

function composeDefaultEmailBody(lead = {}, tone = 'warm', profile = null) {
  const activeProfile = profile || defaultStudioProfile({});
  const greeting = lead.contact_person ? `Bună ziua, ${lead.contact_person},` : 'Bună ziua,';
  const companyLine = lead.company ? `M-am uitat pe scurt la prezența online a firmei ${lead.company}${lead.website ? ` (${lead.website})` : ''}.` : 'M-am uitat pe scurt la prezența online a firmei dumneavoastră.';
  const bullets = briefBullets(lead).slice(0, 2).map(item => `- ${item}`).join('\n');
  const services = suggestedServices(lead, activeProfile).slice(0, 2).map(item => `- ${item}`).join('\n');
  const differentiator = String(activeProfile.studioDifferentiators || '').split(/\n+/).map(item => item.trim()).filter(Boolean)[0] || 'Lucrăm clar, practic și orientat spre rezultat.';
  const signature = activeProfile.studioSignature || 'Cu drag,\nStudioData.ro';
  if (tone === 'short') {
    const observation = briefBullets(lead)[0] || 'site-ul poate fi făcut mai clar pentru vizitatori.';
    return `${greeting}\n\n${companyLine}\nAm observat un lucru care ar putea fi util: ${observation.replace(/[.]+$/, '.').replace(/^./, c => c.toLowerCase())}\n\nDacă vi se pare relevant, vă pot trimite 2-3 recomandări scurte, fără obligații.\n\n${signature}`;
  }
  if (tone === 'followup') {
    return `${greeting}\n\nRevin scurt în legătură cu mesajul despre prezența online a firmei ${lead.company || 'dumneavoastră'}.\n\nDacă website-ul este o prioritate în perioada următoare, vă pot trimite câteva recomandări simple despre ce ar merita ajustat prima dată.\n\nDacă nu este momentul potrivit, nu insist.\n\n${signature}`;
  }
  return `${greeting}\n\n${companyLine}\nVă scriu cu două observații concrete despre modul în care site-ul poate transmite mai clar ce oferiți.\n\nCe am observat:\n${bullets}\n\nUnde v-ar putea ajuta StudioData.ro:\n${services}\n\n${differentiator}\n\nDacă este relevant, vă pot trimite câteva recomandări ordonate, ca să vedeți ce ar merita ajustat prima dată.\n\nNu insist dacă nu este momentul potrivit.\n\n${signature}`;
}

async function showDirectEmail(lead = {}) {
  const profile = defaultStudioProfile(await api.getSettings());
  const initialBody = composeDefaultEmailBody(lead, 'short', profile);
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div class="panel">
    <h2>Trimite email direct</h2>
    <p class="muted">Emailul va fi trimis prin setările SMTP salvate în Setări > Email direct.</p>
    <label>Către<input id="direct-email-to" value="${escAttr(lead.email || '')}"></label>
    <label>Subiect<input id="direct-email-subject" value="${escAttr(defaultEmailSubject(lead))}"></label>
    <div class="toolbar email-variants">
      <button class="secondary" data-email-tone="short" type="button">Scurt</button>
      <button data-email-tone="professional" type="button">Profesional</button>
      <button data-email-tone="followup" type="button">Follow-up</button>
    </div>
    <div id="email-health" class="email-health"></div>
    <label>Mesaj<textarea id="direct-email-body">${esc(initialBody)}</textarea></label>
    <div class="toolbar"><button class="primary" id="send-direct-email">Trimite email</button><button id="close-direct-email">Închide</button></div>
  </div>`;
  document.body.appendChild(modal);
  const refreshHealth = () => { $('#email-health').innerHTML = emailHealthView($('#direct-email-body').value); };
  document.querySelectorAll('[data-email-tone]').forEach(button => {
    button.onclick = () => {
      document.querySelectorAll('[data-email-tone]').forEach(item => item.classList.remove('secondary'));
      button.classList.add('secondary');
      $('#direct-email-body').value = composeDefaultEmailBody(lead, button.dataset.emailTone, profile);
      refreshHealth();
    };
  });
  $('#direct-email-body').addEventListener('input', refreshHealth);
  refreshHealth();
  $('#close-direct-email').onclick = () => modal.remove();
  $('#send-direct-email').onclick = async () => {
    const button = $('#send-direct-email');
    button.disabled = true;
    button.textContent = 'Se trimite...';
    try {
      const sendResult = await api.sendEmail({
        to: $('#direct-email-to').value,
        subject: $('#direct-email-subject').value,
        body: $('#direct-email-body').value
      });
      await api.addActivity({
        lead_id: lead.id,
        type: 'email trimis',
        date: new Date().toISOString().slice(0, 10),
        description: $('#direct-email-subject').value,
        result: emailSendResultText(sendResult)
      });
      toast('Email trimis.');
      modal.remove();
      renderLeads();
    } catch (error) {
      showErrorModal('Emailul nu a fost trimis', error.message || 'Emailul nu a putut fi trimis.');
      button.disabled = false;
      button.textContent = 'Trimite email';
    }
  };
}

function emailHealthView(body = '') {
  const report = emailRiskReport(body);
  return `<div class="email-health-card ${report.level}">
    <strong>${esc(report.label)}</strong>
    <span>${esc(report.summary)}</span>
  </div>`;
}

function emailRiskReport(body = '') {
  const text = String(body || '');
  const lower = text.toLowerCase();
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const bulletCount = (text.match(/^\s*[-•]/gm) || []).length;
  const riskyWords = ['ofertă', 'costuri', 'promoție', 'urgent', 'garanție', 'gratuit', 'cumpărați', 'reducere'];
  const hits = riskyWords.filter(word => lower.includes(word));
  let score = 0;
  if (words > 170) score += 2;
  else if (words > 120) score += 1;
  if (bulletCount > 3) score += 1;
  if (hits.length) score += Math.min(2, hits.length);
  if (text.includes('http://') || text.includes('https://')) score += 1;
  if (score >= 3) return { level: 'high', label: 'Risc spam mai mare', summary: 'Încearcă varianta scurtă sau redu cuvintele comerciale.' };
  if (score >= 1) return { level: 'medium', label: 'Risc spam moderat', summary: 'Mesajul e ok, dar poate fi scurtat puțin.' };
  return { level: 'low', label: 'Risc spam scăzut', summary: `Mesaj scurt și natural: ${words} cuvinte.` };
}

function emailSendResultText(result = {}) {
  const accepted = Array.isArray(result.accepted) ? result.accepted.join(', ') : '';
  const rejected = Array.isArray(result.rejected) ? result.rejected.join(', ') : '';
  const response = result.response ? ` Răspuns server: ${result.response}` : '';
  if (rejected) return `Serverul a respins: ${rejected}.${response}`;
  if (accepted) return `Acceptat de server pentru: ${accepted}.${response}`;
  return `Trimis direct din aplicație.${response}`;
}

async function showPhoneEmail(lead = {}, body = '') {
  const text = composePlainEmail(lead, body);
  await api.copyText(text);
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div class="panel">
    <h2>Email pentru telefon</h2>
    <p class="muted">Textul este copiat pe Mac. Îl poți lipi în Outlook pe telefon dacă ai clipboard partajat sau îl poți copia manual de aici.</p>
    <label>Către<input readonly value="${escAttr(lead?.email || '')}"></label>
    <label>Subiect<input readonly value="${escAttr(defaultEmailSubject(lead))}"></label>
    <label>Mesaj<textarea readonly>${esc(body)}</textarea></label>
    <div class="toolbar"><button class="primary" id="copy-phone-email">Copiază din nou</button><button id="close-phone-email">Închide</button></div>
  </div>`;
  document.body.appendChild(modal);
  $('#copy-phone-email').onclick = () => api.copyText(text).then(() => toast('Email copiat.'));
  $('#close-phone-email').onclick = () => modal.remove();
}

async function saveAs(defaultPath, filters, handler) {
  const res = await api.saveFileDialog({ defaultPath, filters });
  if (!res.canceled) { await handler(res.filePath); toast('Fișier exportat.'); }
}

async function openAndImport(filters, handler) {
  const res = await api.openFileDialog({ properties: ['openFile'], filters });
  if (!res.canceled) { await handler(res.filePaths[0]); toast('Import finalizat.'); }
}

async function renderPrintableLead(id, analysisOnly) {
  const lead = await api.getLead(id);
  app.innerHTML = `<section class="panel"><h1>${analysisOnly ? 'Analiza website' : 'Lead'}: ${esc(lead.company)}</h1><p>${esc(lead.website || '')}</p><p>Scor website: <strong>${lead.analysis_score}/100</strong> · ${scoreLabel(lead.analysis_score)}</p>${analysisFields(lead.analysis_json).replaceAll('<input', '<input disabled')} ${analysisOnly ? '' : `<h2>Observații</h2><p>${esc(lead.notes || '')}</p>`}</section>`;
}

async function renderPrintableOffer(id, previewOnly = false) {
  const offer = await api.getOffer(id);
  if (!offer) return;
  const subtotal = (offer.items || []).reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.price || 0), 0);
  const settings = await api.getSettings();
  app.innerHTML = `<div class="offer-document">
    <header class="offer-document-header">
      <img src="./assets/studiodata-logo.svg" alt="StudioData">
      <div><span>OFERTĂ COMERCIALĂ</span><strong>${esc(offer.offer_number)}</strong></div>
    </header>
    <div class="offer-document-body">
      <section class="offer-document-intro">
        <div><span>PROPUNERE PENTRU</span><h1>${esc(offer.client_name)}</h1>${offer.client_contact ? `<p>În atenția: ${esc(offer.client_contact)}</p>` : ''}</div>
        <dl><dt>Data emiterii</dt><dd>${formatRoDate(offer.issue_date)}</dd><dt>Valabilitate</dt><dd>${esc(offer.valid_days)} zile</dd></dl>
      </section>
      <div class="offer-accent"></div>
      <section><span class="offer-kicker">PROIECT</span><h2>${esc(offer.title)}</h2><p class="offer-objective">${esc(offer.objective)}</p></section>
      <section><span class="offer-kicker">SERVICII INCLUSE</span><table class="offer-document-table"><thead><tr><th>Descriere</th><th>Cant.</th><th>Preț</th><th>Valoare</th></tr></thead><tbody>${offer.items.map(item => `<tr><td>${esc(item.description)}</td><td>${item.quantity}</td><td>${formatMoney(item.price)}</td><td>${formatMoney(item.quantity * item.price)}</td></tr>`).join('')}</tbody></table>
        <div class="offer-document-total">${Number(offer.discount) > 0 ? `<div><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div><div><span>Reducere</span><strong>-${formatMoney(offer.discount)}</strong></div>` : ''}<div class="grand-total"><span>Total ofertă</span><strong>${formatMoney(offerTotal(offer))}</strong></div></div>
      </section>
      <section class="offer-document-columns"><div><span class="offer-kicker">TERMEN ESTIMAT</span><p>${nl2br(offer.delivery_term)}</p></div><div><span class="offer-kicker">MODALITATE DE PLATĂ</span><ul>${String(offer.payment_terms || '').split('\n').filter(Boolean).map(line => `<li>${esc(line)}</li>`).join('')}</ul></div></section>
      <section class="offer-conditions"><span class="offer-kicker">CONDIȚII DE COLABORARE</span><div>${nl2br(offer.conditions)}</div></section>
    </div>
    <footer class="offer-document-footer"><div><strong>StudioData.ro</strong><span>Website-uri moderne. Design. Performanță.</span></div><div>${esc(settings.ownEmail || '')}${settings.ownPhone ? ` · ${esc(settings.ownPhone)}` : ''}${settings.ownWebsite ? ` · ${esc(settings.ownWebsite)}` : ''}</div></footer>
  </div>${previewOnly ? '<button class="preview-back no-print" id="back-to-offer">Înapoi la editor</button>' : ''}`;
  $('#back-to-offer')?.addEventListener('click', () => showPage('offers', { id }));
}

function formatRoDate(value) { if (!value) return ''; return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function nl2br(value) { return esc(value || '').replace(/\n/g, '<br>'); }

function setNotice(text) { $('#notice').textContent = text; $('#notice').classList.toggle('hidden', !text); }
function toast(text) { $('#toast').textContent = text; $('#toast').classList.remove('hidden'); setTimeout(() => $('#toast').classList.add('hidden'), 2800); }
function showErrorModal(title, message) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div class="panel"><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="toolbar"><button class="primary" id="close-error-modal">Închide</button></div></div>`;
  document.body.appendChild(modal);
  $('#close-error-modal').onclick = () => modal.remove();
}
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escAttr(value) { return esc(value).replace(/`/g, '&#96;'); }
function cssEsc(value) { return window.CSS?.escape ? CSS.escape(value) : value.replace(/"/g, '\\"'); }
