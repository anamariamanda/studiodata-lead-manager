const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const STATUSES = ['Nou', 'De analizat', 'Analizat', 'Contactat', 'Follow-up necesar', 'Răspuns primit', 'Interesat', 'Întâlnire programată', 'Ofertă trimisă', 'Negociere', 'Câștigat', 'Pierdut', 'Nu mai contacta'];
const PRIORITIES = ['Scăzută', 'Medie', 'Ridicată', 'Urgentă'];
const SOURCES = ['Google Maps', 'Facebook', 'LinkedIn', 'Recomandare', 'Email', 'Telefon', 'Website', 'Altă sursă'];

const CHECKLIST = [
  'website-ul funcționează',
  'website-ul folosește HTTPS',
  'website-ul este responsive',
  'website-ul se afișează bine pe mobil',
  'website-ul se încarcă rapid',
  'designul este modern',
  'informațiile sunt actualizate',
  'există formular de contact',
  'există buton clar de contact',
  'există email profesional',
  'există pagină de servicii',
  'există recenzii sau testimoniale',
  'există politici GDPR',
  'există politică de cookie-uri',
  'există linkuri către rețelele sociale',
  'informațiile de contact sunt ușor de găsit',
  'există adresă sau hartă',
  'textele sunt clare',
  'imaginile sunt de calitate',
  'există apeluri clare la acțiune'
];

const DEFAULT_TEMPLATES = [
  ['email inițial', 'Bună ziua, {persoana_contact},\n\nAm analizat pe scurt prezența online a firmei {firma} și am observat câteva oportunități care pot ajuta site-ul să fie mai clar și mai convingător pentru potențialii clienți.\n\nPe scurt:\n{brief_site}\n\nLa StudioData.ro vă putem ajuta cu {serviciu}, astfel încât vizitatorii să înțeleagă mai rapid ce oferiți și să vă contacteze mai ușor.\n\nDacă vi se pare util, vă pot trimite câteva recomandări concrete și o propunere simplă.\n\nCu drag,\nStudioData.ro'],
  ['mesaj Facebook', 'Bună ziua! Sunt de la StudioData. Am observat firma {firma} și cred că vă putem ajuta cu {serviciu}. Putem discuta câteva minute?'],
  ['mesaj LinkedIn', 'Bună ziua, {persoana_contact}. Vă scriu din partea StudioData despre prezența digitală a firmei {firma}. Putem discuta pe scurt despre {serviciu}?'],
  ['mesaj WhatsApp', 'Bună ziua! Sunt de la StudioData. Vă contactez în legătură cu {firma}. Cred că vă putem ajuta cu {serviciu}.'],
  ['follow-up după 3 zile', 'Bună ziua! Revin cu un scurt follow-up legat de mesajul trimis pentru {firma}. Vă pot ajuta cu mai multe detalii?'],
  ['follow-up după 5–7 zile', 'Bună ziua! Revin în legătură cu propunerea pentru {firma}. Dacă este un moment potrivit, putem discuta următorii pași.'],
  ['follow-up după trimiterea ofertei', 'Bună ziua! Ați reușit să analizați oferta pentru {firma}? Rămân disponibil pentru întrebări sau ajustări.'],
  ['script de apel telefonic', 'Bună ziua, sunt de la StudioData. Vă contactez pentru că am observat câteva oportunități de îmbunătățire pentru prezența online a firmei {firma}.'],
  ['mesaj pentru firme fără website', 'Bună ziua! Am observat că firma {firma} nu are încă un website vizibil. StudioData poate crea o prezență online clară și profesionistă.'],
  ['mesaj pentru firme cu website vechi', 'Bună ziua! Am observat că website-ul {website} poate fi modernizat. Vă putem ajuta cu design, performanță și structură mai clară.'],
  ['mesaj pentru magazine online', 'Bună ziua! StudioData dezvoltă magazine online rapide, responsive și ușor de administrat. Putem discuta despre {firma}?']
];

class LeadStore {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.dbPath = path.join(userDataPath, 'studiodata-leads.sqlite');
    this.SQL = null;
    this.db = null;
  }

  async ready() {
    if (this.db) return;
    fs.mkdirSync(this.userDataPath, { recursive: true });
    const initSqlJs = require('sql.js');
    this.SQL = await initSqlJs({
      locateFile: file => require.resolve(`sql.js/dist/${file}`)
    });
    if (fs.existsSync(this.dbPath)) {
      this.db = new this.SQL.Database(fs.readFileSync(this.dbPath));
    } else {
      this.db = new this.SQL.Database();
    }
    this.migrate();
    this.seed();
    this.persist();
  }

  migrate() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        company TEXT NOT NULL,
        industry TEXT,
        city TEXT,
        county TEXT,
        contact_person TEXT,
        contact_role TEXT,
        phone TEXT,
        email TEXT,
        website TEXT,
        facebook TEXT,
        linkedin TEXT,
        source TEXT,
        main_problem TEXT,
        other_problems TEXT,
        recommended_service TEXT,
        estimated_budget TEXT,
        status TEXT,
        priority TEXT,
        last_contact_date TEXT,
        next_followup_date TEXT,
        next_followup_time TEXT,
        notes TEXT,
        analysis_json TEXT,
        analysis_score INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT,
        description TEXT,
        result TEXT,
        next_step TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        offer_number TEXT NOT NULL,
        lead_id INTEGER,
        client_name TEXT NOT NULL,
        client_contact TEXT,
        client_email TEXT,
        issue_date TEXT NOT NULL,
        valid_days INTEGER DEFAULT 15,
        title TEXT NOT NULL,
        objective TEXT,
        items_json TEXT NOT NULL,
        payment_terms TEXT,
        delivery_term TEXT,
        conditions TEXT,
        discount REAL DEFAULT 0,
        status TEXT DEFAULT 'Ciornă',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  seed() {
    const count = this.scalar('SELECT COUNT(*) FROM templates');
    if (count === 0) {
      const stmt = this.db.prepare('INSERT INTO templates (name, body, updated_at) VALUES (?, ?, ?)');
      DEFAULT_TEMPLATES.forEach(([name, body]) => stmt.run([name, body, now()]));
      stmt.free();
    }
    if (!this.getSetting('businessName')) this.setSetting('businessName', 'StudioData.ro');
    if (!this.getSetting('ownWebsite')) this.setSetting('ownWebsite', 'studiodata.ro');
    if (!this.getSetting('theme')) this.setSetting('theme', 'system');
    if (!this.getSetting('notifications')) this.setSetting('notifications', 'true');
    if (!this.getSetting('backupFrequency')) this.setSetting('backupFrequency', 'manual');
  }

  persist() {
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  scalar(sql, params = []) {
    const row = this.query(sql, params)[0];
    return row ? Object.values(row)[0] : null;
  }

  query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.run(params);
    stmt.free();
    this.persist();
  }

  listLeads(filters = {}) {
    let sql = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    const add = (field, value, op = '=') => {
      if (value) {
        sql += ` AND ${field} ${op} ?`;
        params.push(op === 'LIKE' ? `%${value}%` : value);
      }
    };
    add('company', filters.company, 'LIKE');
    add('contact_person', filters.contactPerson, 'LIKE');
    add('email', filters.email, 'LIKE');
    add('phone', filters.phone, 'LIKE');
    add('city', filters.city, 'LIKE');
    add('county', filters.county, 'LIKE');
    add('industry', filters.industry, 'LIKE');
    add('status', filters.status);
    add('priority', filters.priority);
    add('source', filters.source);
    add('next_followup_date', filters.followupDate);
    const sortMap = {
      created_at: 'created_at',
      company: 'company COLLATE NOCASE',
      status: 'status',
      priority: 'priority',
      next_followup_date: 'next_followup_date'
    };
    sql += ` ORDER BY ${sortMap[filters.sortBy] || 'created_at'} ${filters.sortDir === 'asc' ? 'ASC' : 'DESC'}`;
    return this.query(sql, params).map(normalizeLead);
  }

  getDashboard() {
    const leads = this.listLeads({ sortBy: 'created_at', sortDir: 'desc' });
    const todayValue = today();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const statusCount = (status) => leads.filter(lead => lead.status === status).length;
    const activities = this.query('SELECT activities.*, leads.company FROM activities LEFT JOIN leads ON leads.id = activities.lead_id ORDER BY activities.created_at DESC LIMIT 8');
    return {
      cards: {
        total: leads.length,
        new: statusCount('Nou'),
        toAnalyze: statusCount('De analizat'),
        contacted: statusCount('Contactat'),
        followupNeeded: statusCount('Follow-up necesar'),
        interested: statusCount('Interesat'),
        offers: statusCount('Ofertă trimisă'),
        won: statusCount('Câștigat')
      },
      todayFollowups: leads.filter(lead => lead.next_followup_date === todayValue),
      overdueFollowups: leads.filter(lead => lead.next_followup_date && lead.next_followup_date < todayValue),
      recentLeads: leads.slice(0, 8),
      recentActivities: activities,
      staleLeads: leads.filter(lead => (lead.updated_at || lead.created_at) < sevenDaysAgo).slice(0, 12)
    };
  }

  getLead(id) {
    const lead = this.query('SELECT * FROM leads WHERE id = ?', [id])[0];
    if (!lead) return null;
    const normalized = normalizeLead(lead);
    normalized.activities = this.query('SELECT * FROM activities WHERE lead_id = ? ORDER BY date DESC, time DESC, id DESC', [id]);
    return normalized;
  }

  saveLead(input) {
    const lead = sanitizeLead(input);
    lead.analysis_score = calculateScore(lead.analysis_json);
    const values = [
      lead.company, lead.industry, lead.city, lead.county, lead.contact_person, lead.contact_role,
      lead.phone, lead.email, lead.website, lead.facebook, lead.linkedin, lead.source,
      lead.main_problem, lead.other_problems, lead.recommended_service, lead.estimated_budget,
      lead.status, lead.priority, lead.last_contact_date, lead.next_followup_date, lead.next_followup_time,
      lead.notes, JSON.stringify(lead.analysis_json), lead.analysis_score, now()
    ];
    if (lead.id) {
      this.run(`UPDATE leads SET company=?, industry=?, city=?, county=?, contact_person=?, contact_role=?, phone=?, email=?, website=?, facebook=?, linkedin=?, source=?, main_problem=?, other_problems=?, recommended_service=?, estimated_budget=?, status=?, priority=?, last_contact_date=?, next_followup_date=?, next_followup_time=?, notes=?, analysis_json=?, analysis_score=?, updated_at=? WHERE id=?`, [...values, lead.id]);
      return this.getLead(lead.id);
    }
    this.run(`INSERT INTO leads (company, industry, city, county, contact_person, contact_role, phone, email, website, facebook, linkedin, source, main_problem, other_problems, recommended_service, estimated_budget, status, priority, last_contact_date, next_followup_date, next_followup_time, notes, analysis_json, analysis_score, updated_at, created_at) VALUES (${Array(26).fill('?').join(',')})`, [...values, lead.created_at || today()]);
    return this.getLead(this.scalar('SELECT MAX(id) FROM leads'));
  }

  deleteLead(id) {
    this.run('DELETE FROM activities WHERE lead_id = ?', [id]);
    this.run('DELETE FROM leads WHERE id = ?', [id]);
    return true;
  }

  duplicateLead(id) {
    const lead = this.getLead(id);
    if (!lead) throw new Error('Lead inexistent.');
    delete lead.id;
    lead.company = `${lead.company} (copie)`;
    lead.status = 'Nou';
    lead.created_at = today();
    return this.saveLead(lead);
  }

  addActivity(activity) {
    const date = activity.date || today();
    this.run('INSERT INTO activities (lead_id, type, date, time, description, result, next_step, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      activity.lead_id, activity.type, date, activity.time || '', activity.description || '', activity.result || '', activity.next_step || '', now()
    ]);
    this.run('UPDATE leads SET updated_at = ? WHERE id = ?', [now(), activity.lead_id]);
    return true;
  }

  listTemplates() {
    return this.query('SELECT * FROM templates ORDER BY name COLLATE NOCASE');
  }

  saveTemplate(template) {
    if (template.id) {
      this.run('UPDATE templates SET name=?, body=?, updated_at=? WHERE id=?', [template.name, template.body, now(), template.id]);
      return template.id;
    }
    this.run('INSERT INTO templates (name, body, updated_at) VALUES (?, ?, ?)', [template.name, template.body, now()]);
    return this.scalar('SELECT last_insert_rowid()');
  }

  listOffers() {
    return this.query('SELECT * FROM offers ORDER BY created_at DESC').map(normalizeOffer);
  }

  getOffer(id) {
    const row = this.query('SELECT * FROM offers WHERE id = ?', [id])[0];
    return row ? normalizeOffer(row) : null;
  }

  saveOffer(input = {}) {
    const offer = sanitizeOffer(input);
    const values = [offer.offer_number, offer.lead_id, offer.client_name, offer.client_contact, offer.client_email,
      offer.issue_date, offer.valid_days, offer.title, offer.objective, JSON.stringify(offer.items), offer.payment_terms,
      offer.delivery_term, offer.conditions, offer.discount, offer.status, now()];
    if (offer.id) {
      this.run(`UPDATE offers SET offer_number=?, lead_id=?, client_name=?, client_contact=?, client_email=?, issue_date=?, valid_days=?, title=?, objective=?, items_json=?, payment_terms=?, delivery_term=?, conditions=?, discount=?, status=?, updated_at=? WHERE id=?`, [...values, offer.id]);
      return this.getOffer(offer.id);
    }
    this.run(`INSERT INTO offers (offer_number, lead_id, client_name, client_contact, client_email, issue_date, valid_days, title, objective, items_json, payment_terms, delivery_term, conditions, discount, status, updated_at, created_at) VALUES (${Array(17).fill('?').join(',')})`, [...values, now()]);
    return this.getOffer(this.scalar('SELECT MAX(id) FROM offers'));
  }

  deleteOffer(id) {
    this.run('DELETE FROM offers WHERE id = ?', [id]);
    return true;
  }

  getSettings() {
    const rows = this.query('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
  }

  saveSettings(settings) {
    Object.entries(settings || {}).forEach(([key, value]) => this.setSetting(key, String(value ?? '')));
    this.persist();
    return this.getSettings();
  }

  getSetting(key) {
    return this.scalar('SELECT value FROM settings WHERE key=?', [key]);
  }

  setSetting(key, value) {
    this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }

  exportBackup(targetPath) {
    const data = {
      exportedAt: now(),
      version: 1,
      leads: this.listLeads({ sortBy: 'created_at', sortDir: 'asc' }),
      activities: this.query('SELECT * FROM activities ORDER BY id ASC'),
      templates: this.listTemplates(),
      offers: this.listOffers(),
      settings: this.getSettings()
    };
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
    return { targetPath };
  }

  importBackup(sourcePath) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    } catch (error) {
      throw new Error('Fișierul de backup nu este JSON valid.');
    }
    if (!Array.isArray(parsed.leads) || !Array.isArray(parsed.templates)) throw new Error('Backup invalid.');
    const safety = path.join(this.userDataPath, `backup-before-restore-${stamp()}.json`);
    this.exportBackup(safety);
    this.db.run('DELETE FROM activities; DELETE FROM leads; DELETE FROM templates;');
    parsed.leads.forEach(lead => this.saveLead(lead));
    parsed.activities?.forEach(activity => this.addActivity(activity));
    parsed.templates.forEach(template => this.saveTemplate(template));
    this.db.run('DELETE FROM offers;');
    parsed.offers?.forEach(offer => this.saveOffer(offer));
    this.saveSettings(parsed.settings || {});
    this.persist();
    return { restored: true, safety };
  }

  createAutomaticBackup() {
    const settings = this.getSettings();
    const folder = settings.backupFolder || this.userDataPath;
    fs.mkdirSync(folder, { recursive: true });
    const targetPath = path.join(folder, `studiodata-backup-${stamp()}.json`);
    return this.exportBackup(targetPath);
  }

  exportCsv(targetPath) {
    const rows = this.listLeads({ sortBy: 'created_at', sortDir: 'asc' });
    const headers = Object.keys(sanitizeLead({ company: 'x' })).filter(key => key !== 'analysis_json');
    const csv = [headers.join(','), ...rows.map(row => headers.map(key => csvCell(row[key])).join(','))].join('\n');
    fs.writeFileSync(targetPath, csv, 'utf8');
    return { targetPath };
  }

  importCsv(sourcePath) {
    const text = fs.readFileSync(sourcePath, 'utf8');
    const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
    if (!head) throw new Error('Fișier CSV gol.');
    const headers = parseCsvLine(head);
    if (!headers.includes('company')) throw new Error('CSV invalid: coloana company este obligatorie.');
    let imported = 0;
    lines.forEach(line => {
      const values = parseCsvLine(line);
      const lead = {};
      headers.forEach((header, index) => lead[header] = values[index] || '');
      if (lead.company) {
        this.saveLead(lead);
        imported += 1;
      }
    });
    return { imported };
  }

  importContactList(sourcePath) {
    const text = readContactText(sourcePath);
    const leads = parseContactText(text);
    let imported = 0;
    leads.forEach(lead => {
      this.saveLead(lead);
      imported += 1;
    });
    return { imported, skipped: Math.max(0, text.split(/\r?\n/).filter(Boolean).length - imported) };
  }
}

function readContactText(sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.rtf') {
    try {
      return execFileSync('/usr/bin/textutil', ['-convert', 'txt', '-stdout', sourcePath], { encoding: 'utf8' });
    } catch (error) {
      throw new Error('Nu am putut citi fișierul RTF.');
    }
  }
  return fs.readFileSync(sourcePath, 'utf8');
}

function parseContactText(textValue = '') {
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  return String(textValue)
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(line => {
      const emails = [...line.matchAll(emailRegex)];
      if (!emails.length) return null;
      const firstEmail = emails[0][0];
      const lastEmail = emails[emails.length - 1];
      const contact = line.slice(0, emails[0].index).trim();
      const company = line.slice(lastEmail.index + lastEmail[0].length).trim();
      if (!company) return null;
      return {
        company,
        contact_person: normalizeName(contact),
        email: firstEmail.toLowerCase(),
        source: 'Email',
        status: 'Nou',
        priority: 'Medie',
        main_problem: 'Lead importat din listă. Necesită verificare și contactare.',
        recommended_service: 'Website de prezentare / Optimizare prezență online',
        notes: [
          'Importat automat din listă RTF/TXT.',
          emails.length > 1 ? `Emailuri găsite: ${emails.map(match => match[0]).join(', ')}` : '',
          `Linie originală: ${line}`
        ].filter(Boolean).join('\n')
      };
    })
    .filter(Boolean);
}

function normalizeName(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\b[\p{L}]/gu, char => char.toUpperCase())
    .trim();
}

function sanitizeLead(input = {}) {
  const analysis = input.analysis_json || Object.fromEntries(CHECKLIST.map(item => [item, { checked: false, note: '' }]));
  return {
    id: input.id || null,
    created_at: input.created_at || today(),
    company: text(input.company),
    industry: text(input.industry),
    city: text(input.city),
    county: text(input.county),
    contact_person: text(input.contact_person),
    contact_role: text(input.contact_role),
    phone: text(input.phone),
    email: text(input.email),
    website: text(input.website),
    facebook: text(input.facebook),
    linkedin: text(input.linkedin),
    source: SOURCES.includes(input.source) ? input.source : 'Altă sursă',
    main_problem: text(input.main_problem),
    other_problems: text(input.other_problems),
    recommended_service: text(input.recommended_service),
    estimated_budget: text(input.estimated_budget),
    status: STATUSES.includes(input.status) ? input.status : 'Nou',
    priority: PRIORITIES.includes(input.priority) ? input.priority : 'Medie',
    last_contact_date: text(input.last_contact_date),
    next_followup_date: text(input.next_followup_date),
    next_followup_time: text(input.next_followup_time),
    notes: text(input.notes),
    analysis_json: typeof analysis === 'string' ? JSON.parse(analysis || '{}') : analysis,
    analysis_score: Number(input.analysis_score || 0)
  };
}

function sanitizeOffer(input = {}) {
  let items = input.items || input.items_json || [];
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch (_) { items = []; }
  }
  return {
    id: input.id || null,
    offer_number: text(input.offer_number) || `SD-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    lead_id: input.lead_id ? Number(input.lead_id) : null,
    client_name: text(input.client_name),
    client_contact: text(input.client_contact),
    client_email: text(input.client_email),
    issue_date: text(input.issue_date) || today(),
    valid_days: Math.max(1, Number(input.valid_days || 15)),
    title: text(input.title) || 'Dezvoltare website de prezentare',
    objective: text(input.objective),
    items: Array.isArray(items) ? items.map(item => ({ description: text(item.description), quantity: Math.max(1, Number(item.quantity || 1)), price: Math.max(0, Number(item.price || 0)) })).filter(item => item.description) : [],
    payment_terms: text(input.payment_terms),
    delivery_term: text(input.delivery_term),
    conditions: text(input.conditions),
    discount: Math.max(0, Number(input.discount || 0)),
    status: text(input.status) || 'Ciornă',
    created_at: input.created_at || now(),
    updated_at: input.updated_at || now()
  };
}

function normalizeOffer(row) {
  return sanitizeOffer(row);
}

function normalizeLead(row) {
  const lead = sanitizeLead(row);
  lead.id = row.id;
  lead.updated_at = row.updated_at;
  lead.analysis_score = calculateScore(lead.analysis_json);
  return lead;
}

function calculateScore(analysis) {
  const entries = Object.values(analysis || {});
  if (!entries.length) return 0;
  return Math.round((entries.filter(item => item.checked).length / CHECKLIST.length) * 100);
}

function text(value) {
  return String(value || '').trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function now() {
  return new Date().toISOString();
}

function stamp() {
  return now().replace(/[:.]/g, '-');
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

module.exports = { LeadStore, STATUSES, PRIORITIES, SOURCES, CHECKLIST };
