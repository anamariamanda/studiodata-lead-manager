const { app, BrowserWindow, Menu, ipcMain, shell, dialog, Notification, nativeTheme, clipboard, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { LeadStore } = require('./store');

let mainWindow;
let store;

const isMac = process.platform === 'darwin';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    title: 'StudioData Lead Manager',
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
}

function openExternal(url) {
  try {
    let safeUrl = String(url || '').trim();
    if (!safeUrl) return false;
    if (/^www\./i.test(safeUrl)) safeUrl = `https://${safeUrl}`;
    const parsed = new URL(safeUrl);
    if (['http:', 'https:', 'mailto:', 'tel:', 'sms:'].includes(parsed.protocol) || safeUrl.startsWith('whatsapp://')) {
      shell.openExternal(safeUrl);
      return true;
    }
  } catch (_) {}
  return false;
}

function getEmailSettings() {
  const settings = store.getSettings();
  return {
    fromName: settings.emailFromName || 'StudioData.ro',
    fromEmail: settings.emailFromEmail || 'contact@studiodata.ro',
    host: settings.emailHost || '',
    port: settings.emailPort || '465',
    secure: settings.emailSecure || 'true',
    user: settings.emailUser || 'smtp@studiodata.ro',
    bcc: settings.emailBcc || settings.ownEmail || settings.emailFromEmail || 'contact@studiodata.ro',
    hasPassword: Boolean(settings.emailPasswordEncrypted)
  };
}

function saveEmailSettings(input = {}) {
  const next = {
    emailFromName: String(input.fromName || 'StudioData.ro').trim(),
    emailFromEmail: String(input.fromEmail || 'contact@studiodata.ro').trim(),
    emailHost: String(input.host || '').trim(),
    emailPort: String(input.port || '465').trim(),
    emailSecure: String(input.secure ?? 'true'),
    emailUser: String(input.user || input.fromEmail || 'smtp@studiodata.ro').trim(),
    emailBcc: String(input.bcc || '').trim()
  };
  const password = String(input.password || '');
  if (password) {
    next.emailPasswordEncrypted = encryptSecret(password);
  }
  store.saveSettings(next);
  return getEmailSettings();
}

function encryptSecret(value) {
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:${safeStorage.encryptString(value).toString('base64')}`;
  }
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
}

function decryptSecret(value = '') {
  if (!value) return '';
  if (value.startsWith('safe:') && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(value.slice(5), 'base64'));
  }
  if (value.startsWith('plain:')) return Buffer.from(value.slice(6), 'base64').toString('utf8');
  return '';
}

async function sendDirectEmail(message = {}) {
  const { transporter, settings } = createEmailTransporter();
  const to = String(message.to || '').trim();
  if (!to || !to.includes('@')) throw new Error('Adresa destinatarului nu este validă.');
  const replyTo = String(settings.ownEmail || settings.emailReplyTo || 'contact@studiodata.ro').trim();
  const fromEmail = String(settings.emailFromEmail || 'contact@studiodata.ro').trim();
  const smtpUser = String(settings.emailUser || fromEmail).trim();
  const bcc = String(settings.emailBcc || settings.ownEmail || fromEmail).trim();
  const signatureAttachment = emailSignatureAttachment();
  const info = await transporter.sendMail({
    from: `"${settings.emailFromName || 'StudioData.ro'}" <${fromEmail}>`,
    sender: smtpUser && smtpUser.toLowerCase() !== fromEmail.toLowerCase() ? smtpUser : undefined,
    to,
    bcc: bcc && bcc.toLowerCase() !== to.toLowerCase() ? bcc : undefined,
    subject: String(message.subject || 'Mesaj StudioData'),
    text: textWithSignature(String(message.body || ''), settings),
    html: textToEmailHtml(String(message.body || ''), settings, signatureAttachment ? signatureAttachment.cid : ''),
    replyTo: replyTo || fromEmail,
    attachments: signatureAttachment ? [signatureAttachment] : []
  });
  return {
    sent: true,
    messageId: info.messageId || '',
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    response: info.response || ''
  };
}

function textWithSignature(text = '', settings = {}) {
  const signature = [
    '',
    '--',
    settings.emailFromName || settings.businessName || 'StudioData.ro',
    'Website-uri moderne. Design. Performanță.',
    settings.ownWebsite || 'https://studiodata.ro',
    settings.ownEmail || settings.emailFromEmail || 'contact@studiodata.ro',
    settings.ownPhone || ''
  ].filter(Boolean).join('\n');
  return `${String(text || '').trim()}\n${signature}`;
}

function textToEmailHtml(text = '', settings = {}, logoCid = '') {
  const safe = String(text)
    .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
    .replace(/\n/g, '<br>');
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.55;color:#172033">
    <div>${safe}</div>
    ${emailSignatureHtml(settings, logoCid)}
  </div>`;
}

function emailSignatureHtml(settings = {}, logoCid = '') {
  const website = escapeHtml(settings.ownWebsite || 'https://studiodata.ro');
  const email = escapeHtml(settings.ownEmail || settings.emailFromEmail || 'contact@studiodata.ro');
  const phone = escapeHtml(settings.ownPhone || '');
  const logo = logoCid ? `<img src="cid:${logoCid}" alt="StudioData" width="188" style="display:block;width:188px;max-width:100%;height:auto;margin:0 0 8px 0;">` : '<strong style="display:block;color:#37517e;font-size:18px;margin-bottom:4px;">StudioData.ro</strong>';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #dce3ea;padding-top:14px;width:100%;max-width:520px;">
    <tr>
      <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#172033;font-size:13px;line-height:1.45;">
        ${logo}
        <div style="color:#37517e;font-weight:600;margin-bottom:4px;">Website-uri moderne. Design. Performanță.</div>
        <div style="color:#6c7482;">${email}${phone ? ` · ${phone}` : ''}</div>
        <div><a href="${website}" style="color:#1b6f95;text-decoration:none;">${website.replace(/^https?:\/\//, '')}</a></div>
      </td>
    </tr>
  </table>`;
}

function emailSignatureAttachment() {
  const logoPath = path.join(__dirname, '../renderer/assets/studiodata-logo-email.svg');
  try {
    return {
      filename: 'studiodata-logo.svg',
      content: fs.readFileSync(logoPath),
      contentType: 'image/svg+xml',
      cid: 'studiodata-logo'
    };
  } catch (_) {
    return null;
  }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function createEmailTransporter() {
  const settings = store.getSettings();
  const host = String(settings.emailHost || '').trim();
  const port = Number(settings.emailPort || 465);
  const user = String(settings.emailUser || settings.emailFromEmail || '').trim();
  const password = decryptSecret(settings.emailPasswordEncrypted);
  if (!host || !user || !password) {
    throw new Error('Completează setările SMTP în Setări > Email direct.');
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: String(settings.emailSecure || 'true') === 'true',
    auth: { user, pass: password }
  });
  return { transporter, settings };
}

async function testEmailSettings() {
  const { transporter } = createEmailTransporter();
  await transporter.verify();
  return { ok: true };
}

function normalizePublicUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new Error('Introdu un website valid.');
  if (/^www\./i.test(raw)) raw = `https://${raw}`;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Sunt acceptate doar linkuri http sau https.');
  return url;
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function plainText(html = '') {
  return decodeHtml(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return '';
}

function findSocialUrl(html, host, name) {
  const regex = new RegExp(`https?:\\/\\/(?:www\\.)?${name}\\.com\\/[^"'\\s<>]+`, 'i');
  const match = html.match(regex);
  return match ? match[0].replace(/[),.]+$/, '') : '';
}

function hasAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

function auditCheck(checked, note) {
  return { checked: Boolean(checked), note };
}

function buildClientBrief({ company, finalUrl, score, analysis, found }) {
  const positives = [];
  const opportunities = [];

  if (analysis['website-ul funcționează']?.checked) positives.push('site-ul este activ și poate fi accesat de clienți');
  if (analysis['website-ul folosește HTTPS']?.checked) positives.push('folosește o conexiune sigură');
  if (analysis['există email profesional']?.checked || analysis['informațiile de contact sunt ușor de găsit']?.checked) positives.push('datele de contact sunt vizibile');
  if (analysis['există linkuri către rețelele sociale']?.checked) positives.push('există legături către rețele sociale');
  if (analysis['există pagină de servicii']?.checked) positives.push('serviciile sunt menționate pe site');

  if (!analysis['website-ul se afișează bine pe mobil']?.checked) opportunities.push('merită verificat și îmbunătățit modul în care site-ul se vede pe telefon, unde intră mulți clienți');
  if (!analysis['există buton clar de contact']?.checked) opportunities.push('ar ajuta un buton de contact mai vizibil, pentru ca vizitatorii să știe rapid ce pas să facă');
  if (!analysis['există recenzii sau testimoniale']?.checked) opportunities.push('recenziile sau exemplele de clienți pot crește încrederea înainte de primul contact');
  if (!analysis['există politici GDPR']?.checked || !analysis['există politică de cookie-uri']?.checked) opportunities.push('zona de încredere și conformitate poate fi completată cu politici clare de confidențialitate/cookie-uri');
  if (!analysis['textele sunt clare']?.checked) opportunities.push('textele pot fi organizate mai clar, ca beneficiile și serviciile să fie înțelese mai repede');
  if (!analysis['există apeluri clare la acțiune']?.checked) opportunities.push('site-ul ar putea ghida mai bine vizitatorul către cerere de ofertă, programare sau apel');
  if (!analysis['website-ul se încarcă rapid']?.checked) opportunities.push('viteza de încărcare merită verificată, pentru a reduce pierderea vizitatorilor nerăbdători');

  const positiveText = positives.length
    ? `Am observat câteva lucruri bune: ${joinHuman(positives.slice(0, 3))}.`
    : 'Site-ul este prezent online, dar nu am găsit suficiente elemente clare care să transmită rapid încredere și direcție.';
  const opportunityText = opportunities.length
    ? `Principalele oportunități sunt: ${joinHuman(opportunities.slice(0, 4))}.`
    : 'Auditul rapid nu a găsit lipsuri majore evidente, însă ar merita verificată manual structura paginilor și calitatea mesajului comercial.';

  const scoreText = score >= 80
    ? 'Per ansamblu, site-ul pare într-o zonă bună, iar discuția poate merge spre optimizări fine și conversii mai bune.'
    : score >= 60
      ? 'Per ansamblu, site-ul are o bază utilizabilă, dar există câteva ajustări care pot ajuta la mai multă încredere și mai multe cereri.'
      : score >= 40
        ? 'Per ansamblu, site-ul transmite informații de bază, dar poate pierde clienți prin lipsa unor elemente simple de claritate, contact și încredere.'
        : 'Per ansamblu, site-ul are nevoie de îmbunătățiri importante pentru a susține mai bine imaginea firmei și contactarea.';

  return [
    `Brief pentru ${company || finalUrl}:`,
    positiveText,
    opportunityText,
    scoreText,
    'Recomandarea noastră este o discuție scurtă despre ce servicii trebuie evidențiate, ce acțiune vrem de la vizitator și ce modificări pot aduce rapid mai multă credibilitate.'
  ].join('\n');
}

function joinHuman(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} și ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} și ${items.at(-1)}`;
}

function requestText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'StudioData Lead Manager/1.0 (+https://studiodata.ro)',
        Accept: 'text/html,application/xhtml+xml'
      },
      timeout: 12000
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 4) {
        res.resume();
        return resolve(requestText(new URL(res.headers.location, url), redirects + 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`Website-ul a răspuns cu status ${res.statusCode}.`));
      }
      const contentType = String(res.headers['content-type'] || '');
      if (contentType && !contentType.includes('text/html')) {
        res.resume();
        return reject(new Error('Linkul nu pare să fie o pagină HTML.'));
      }
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size <= 900000) chunks.push(chunk);
        else req.destroy(new Error('Pagina este prea mare pentru analiza rapidă.'));
      });
      res.on('end', () => resolve({ url: res.responseUrl || url.href, html: Buffer.concat(chunks).toString('utf8'), durationMs: Date.now() - startedAt }));
    });
    req.on('timeout', () => req.destroy(new Error('Website-ul răspunde prea lent.')));
    req.on('error', reject);
  });
}

async function scrapeWebsite(inputUrl) {
  const url = normalizePublicUrl(inputUrl);
  const { url: finalUrl, html, durationMs } = await requestText(url);
  const title = firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
  const description = firstMatch(html, [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i
  ]);
  const ogSite = firstMatch(html, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i
  ]);
  const text = plainText(html);
  const lowerHtml = html.toLowerCase();
  const lowerText = text.toLowerCase();
  const emails = [...new Set((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(email => email.toLowerCase()))];
  const phones = [...new Set((text.match(/(?:\+40|0040|0)\s?(?:7\d{2}|2\d{2}|3\d{2})[\s.-]?\d{3}[\s.-]?\d{3}/g) || []).map(phone => phone.replace(/\s+/g, ' ').trim()))];
  const facebook = findSocialUrl(html, url.host, 'facebook');
  const linkedin = findSocialUrl(html, url.host, 'linkedin');
  const socialLinks = [facebook, linkedin].filter(Boolean);
  const hasHttps = new URL(finalUrl).protocol === 'https:';
  const hasContact = /contact|mailto:|tel:|formular|whatsapp/i.test(html);
  const hasResponsive = /name=["']viewport["']/i.test(html);
  const hasCookie = /cookie|cookies|gdpr|confidențialitate|confidentialitate|politica de confidentialitate|privacy/i.test(text);
  const hasServices = hasAny(lowerText, [/servicii/, /services/, /soluții/, /solutii/, /ofertă/, /oferta/]) || /href=["'][^"']*(servicii|services|oferta|solutions)/i.test(html);
  const hasReviews = hasAny(lowerText, [/recenzii/, /review/, /testimoniale/, /testimonial/, /clienții noștri/, /clientii nostri/]);
  const hasGdpr = hasAny(lowerText, [/gdpr/, /confidențialitate/, /confidentialitate/, /privacy/, /date personale/]);
  const hasAddress = hasAny(lowerText, [/strada\b/, /\bstr\./, /bulevard/, /\bbd\./, /județ/, /jud\./, /românia/, /romania/]);
  const hasMap = /google\.com\/maps|maps\.google|goo\.gl\/maps|waze\.com/i.test(html);
  const hasImages = (html.match(/<img\b/gi) || []).length >= 2;
  const hasAltImages = /<img[^>]+alt=["'][^"']{3,}["']/i.test(html);
  const hasCta = hasAny(lowerText, [/contactează-ne/, /contacteaza-ne/, /cere ofertă/, /cere oferta/, /solicită ofertă/, /solicita oferta/, /programează/, /programeaza/, /sună acum/, /suna acum/, /trimite mesaj/]);
  const hasModernMeta = /property=["']og:|name=["']twitter:|application\/ld\+json|schema\.org/i.test(html);
  const textLength = text.length;
  const hasClearTexts = textLength > 700 && textLength < 45000;
  const hasMobileHints = hasResponsive && /@media|bootstrap|tailwind|foundation|responsive|viewport|display:\s*flex|display:\s*grid/i.test(html);
  const loadsFast = durationMs < 2500 && Buffer.byteLength(html, 'utf8') < 750000;
  const company = ogSite || title.replace(/\s[-|–].*$/, '') || url.hostname.replace(/^www\./, '');
  const analysis = {
    'website-ul funcționează': auditCheck(true, `Pagina a răspuns în ${durationMs} ms.`),
    'website-ul folosește HTTPS': auditCheck(hasHttps, hasHttps ? 'Website-ul final folosește HTTPS.' : 'Website-ul final nu folosește HTTPS.'),
    'website-ul este responsive': auditCheck(hasResponsive, hasResponsive ? 'Am găsit meta viewport.' : 'Nu am găsit meta viewport.'),
    'website-ul se afișează bine pe mobil': auditCheck(hasMobileHints, hasMobileHints ? 'Există indicii pentru layout responsive.' : 'Nu pot confirma afișarea mobilă doar din HTML.'),
    'website-ul se încarcă rapid': auditCheck(loadsFast, loadsFast ? `Răspuns rapid: ${durationMs} ms.` : `Răspuns lent sau pagină mare: ${durationMs} ms.`),
    'designul este modern': auditCheck(hasModernMeta && hasResponsive, hasModernMeta ? 'Are meta/structuri moderne detectabile.' : 'Nu am găsit indicii moderne evidente.'),
    'informațiile sunt actualizate': auditCheck(/\b202[4-9]\b|copyright|©/i.test(text), 'Verificare automată orientativă după ani/copyright.'),
    'există formular de contact': auditCheck(/<form\b/i.test(html) && /contact|email|telefon|message|mesaj/i.test(html), 'Am verificat prezența unui formular de contact.'),
    'există buton clar de contact': auditCheck(hasContact || hasCta, hasContact || hasCta ? 'Există indicii clare de contact/CTA.' : 'Contactul nu este evident în HTML.'),
    'există email profesional': auditCheck(Boolean(emails[0]), emails[0] || 'Nu am găsit email public.'),
    'există pagină de servicii': auditCheck(hasServices, hasServices ? 'Am găsit termeni/linkuri pentru servicii.' : 'Nu am găsit pagină/termeni de servicii.'),
    'există recenzii sau testimoniale': auditCheck(hasReviews, hasReviews ? 'Am găsit termeni de recenzii/testimoniale.' : 'Nu am găsit recenzii/testimoniale.'),
    'există politici GDPR': auditCheck(hasGdpr, hasGdpr ? 'Am găsit termeni GDPR/confidențialitate.' : 'Nu am găsit indicii GDPR clare.'),
    'există politică de cookie-uri': auditCheck(hasCookie, hasCookie ? 'Am găsit termeni legați de cookies.' : 'Nu am găsit politică de cookie-uri.'),
    'există linkuri către rețelele sociale': auditCheck(Boolean(socialLinks.length), socialLinks.join(' ') || 'Nu am găsit linkuri social media.'),
    'informațiile de contact sunt ușor de găsit': auditCheck(Boolean(emails[0] || phones[0] || hasContact), [emails[0], phones[0]].filter(Boolean).join(' · ') || 'Nu am găsit contact clar.'),
    'există adresă sau hartă': auditCheck(hasAddress || hasMap, hasMap ? 'Am găsit hartă.' : hasAddress ? 'Am găsit indicii de adresă.' : 'Nu am găsit adresă/hartă.'),
    'textele sunt clare': auditCheck(hasClearTexts, hasClearTexts ? `Text suficient pentru prezentare (${textLength} caractere).` : `Text prea puțin sau prea mult pentru verificarea automată (${textLength} caractere).`),
    'imaginile sunt de calitate': auditCheck(hasImages && hasAltImages, hasImages ? 'Există imagini; verificarea calității vizuale este orientativă.' : 'Nu am găsit suficiente imagini.'),
    'există apeluri clare la acțiune': auditCheck(hasCta, hasCta ? 'Am găsit formulări de tip call-to-action.' : 'Nu am găsit CTA clar.')
  };
  const score = Math.round((Object.values(analysis).filter(item => item.checked).length / Object.values(analysis).length) * 100);
  const clientBrief = buildClientBrief({
    company,
    finalUrl,
    score,
    analysis,
    found: { emails, phones, facebook, linkedin, durationMs }
  });

  return {
    url: finalUrl,
    lead: {
      company,
      email: emails[0] || '',
      phone: phones[0] || '',
      website: finalUrl,
      facebook,
      linkedin,
      source: 'Website',
      status: 'De analizat',
      priority: hasContact && hasHttps ? 'Medie' : 'Ridicată',
      main_problem: score >= 70 ? 'Site bun, cu oportunități de optimizare.' : 'Website-ul poate pierde clienți prin lipsuri de claritate, contact sau încredere.',
      other_problems: clientBrief,
      recommended_service: 'Optimizare SEO / Website de prezentare',
      notes: [
        `Audit automat: ${finalUrl}`,
        `Scor estimat: ${score}/100`,
        '',
        clientBrief,
        '',
        description,
        emails.length > 1 ? `Emailuri găsite: ${emails.join(', ')}` : '',
        phones.length > 1 ? `Telefoane găsite: ${phones.join(', ')}` : ''
      ].filter(Boolean).join('\n'),
      analysis_json: analysis
    },
    found: {
      title,
      description,
      emails,
      phones,
      facebook,
      linkedin,
      hasHttps,
      hasResponsive,
      hasContact,
      hasCookie,
      durationMs,
      score,
      clientBrief
    }
  };
}

function createMenu() {
  const template = [
    ...(isMac ? [{
      label: 'StudioData Lead Manager',
      submenu: [
        { role: 'about', label: 'Despre aplicație' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Închide aplicația' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Adaugă lead', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:navigate', 'add') },
        { label: 'Import', click: () => mainWindow?.webContents.send('menu:navigate', 'backup') },
        { label: 'Export', click: () => mainWindow?.webContents.send('menu:navigate', 'backup') },
        { label: 'Backup', click: () => mainWindow?.webContents.send('menu:navigate', 'backup') },
        { type: 'separator' },
        { role: 'close', label: 'Închide fereastra' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reîncarcă' },
        { role: 'zoomIn', label: 'Mărire' },
        { role: 'zoomOut', label: 'Micșorare' },
        { role: 'resetZoom', label: 'Dimensiune normală' },
        { role: 'togglefullscreen', label: 'Full Screen' }
      ]
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
    {
      label: 'Help',
      submenu: [
        { label: 'Ghid de utilizare', click: () => mainWindow?.webContents.send('menu:navigate', 'help') },
        { label: 'Despre aplicație', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: 'StudioData Lead Manager', message: 'StudioData Lead Manager', detail: 'Mini-CRM local pentru StudioData.ro.' }) },
        { label: 'Deschide folderul datelor', click: () => shell.openPath(app.getPath('userData')) }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function installIpc() {
  ipcMain.handle('app:init', async () => {
    await store.ready();
    return {
      userDataPath: app.getPath('userData'),
      dbPath: store.dbPath,
      platform: process.platform,
      arch: process.arch,
      theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    };
  });
  ipcMain.handle('leads:list', (_, filters) => store.listLeads(filters));
  ipcMain.handle('leads:dashboard', () => store.getDashboard());
  ipcMain.handle('leads:get', (_, id) => store.getLead(id));
  ipcMain.handle('leads:save', (_, lead) => store.saveLead(lead));
  ipcMain.handle('leads:delete', (_, id) => store.deleteLead(id));
  ipcMain.handle('leads:duplicate', (_, id) => store.duplicateLead(id));
  ipcMain.handle('activities:add', (_, activity) => store.addActivity(activity));
  ipcMain.handle('templates:list', () => store.listTemplates());
  ipcMain.handle('templates:save', (_, template) => store.saveTemplate(template));
  ipcMain.handle('offers:list', () => store.listOffers());
  ipcMain.handle('offers:get', (_, id) => store.getOffer(id));
  ipcMain.handle('offers:save', (_, offer) => store.saveOffer(offer));
  ipcMain.handle('offers:delete', (_, id) => store.deleteOffer(id));
  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:save', (_, settings) => store.saveSettings(settings));
  ipcMain.handle('email:getSettings', () => getEmailSettings());
  ipcMain.handle('email:saveSettings', (_, settings) => saveEmailSettings(settings));
  ipcMain.handle('email:send', (_, message) => sendDirectEmail(message));
  ipcMain.handle('email:test', () => testEmailSettings());
  ipcMain.handle('scraper:website', (_, url) => scrapeWebsite(url));
  ipcMain.handle('backup:exportJson', (_, targetPath) => store.exportBackup(targetPath));
  ipcMain.handle('backup:importJson', (_, sourcePath) => store.importBackup(sourcePath));
  ipcMain.handle('backup:exportCsv', (_, targetPath) => store.exportCsv(targetPath));
  ipcMain.handle('backup:importCsv', (_, sourcePath) => store.importCsv(sourcePath));
  ipcMain.handle('backup:importContacts', (_, sourcePath) => store.importContactList(sourcePath));
  ipcMain.handle('backup:auto', () => store.createAutomaticBackup());
  ipcMain.handle('dialog:openFile', (_, options) => dialog.showOpenDialog(mainWindow, options));
  ipcMain.handle('dialog:saveFile', (_, options) => dialog.showSaveDialog(mainWindow, options));
  ipcMain.handle('dialog:openDirectory', (_, options) => dialog.showOpenDialog(mainWindow, { ...options, properties: ['openDirectory', 'createDirectory'] }));
  ipcMain.handle('external:open', (_, url) => openExternal(url));
  ipcMain.handle('clipboard:writeText', (_, text) => clipboard.writeText(String(text || '')));
  ipcMain.handle('finder:openDataFolder', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('pdf:lead', async (_, leadId) => {
    const lead = store.getLead(leadId);
    const file = dialog.showSaveDialogSync(mainWindow, {
      title: 'Exportă lead în PDF',
      defaultPath: `${lead.company || 'lead'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (!file) return { cancelled: true };
    mainWindow.webContents.send('print:lead', { leadId });
    await new Promise(resolve => setTimeout(resolve, 400));
    const pdf = await mainWindow.webContents.printToPDF({ printBackground: true });
    fs.writeFileSync(file, pdf);
    return { file };
  });
  ipcMain.handle('pdf:analysis', async (_, leadId) => {
    const lead = store.getLead(leadId);
    const file = dialog.showSaveDialogSync(mainWindow, {
      title: 'Exportă analiza website-ului în PDF',
      defaultPath: `Analiza website - ${lead.company || 'lead'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (!file) return { cancelled: true };
    mainWindow.webContents.send('print:analysis', { leadId });
    await new Promise(resolve => setTimeout(resolve, 400));
    const pdf = await mainWindow.webContents.printToPDF({ printBackground: true });
    fs.writeFileSync(file, pdf);
    return { file };
  });
  ipcMain.handle('pdf:offer', async (_, offerId) => {
    const offer = store.getOffer(offerId);
    if (!offer) throw new Error('Oferta nu există.');
    const safeClient = (offer.client_name || 'client').replace(/[\\/:*?"<>|]/g, '-');
    const file = dialog.showSaveDialogSync(mainWindow, {
      title: 'Exportă oferta în PDF',
      defaultPath: `Oferta StudioData - ${safeClient}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (!file) return { cancelled: true };
    mainWindow.webContents.send('print:offer', { offerId });
    await new Promise(resolve => setTimeout(resolve, 650));
    const pdf = await mainWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    fs.writeFileSync(file, pdf);
    mainWindow.webContents.send('menu:navigate', 'offers');
    return { file };
  });
  ipcMain.handle('notify:test', (_, body) => {
    if (Notification.isSupported()) {
      new Notification({ title: 'StudioData Lead Manager', body }).show();
    }
  });
}

app.whenReady().then(async () => {
  store = new LeadStore(app.getPath('userData'));
  await store.ready();
  installIpc();
  createMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
