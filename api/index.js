// Omega Network - Client Billing Tracker
// Vercel serverless backend. Mirrors api.php's endpoints/behavior, backed by Vercel Postgres
// (works because Vercel functions have no persistent disk - SQLite/file storage doesn't survive
// between invocations there, so this uses a real hosted database instead).

const { sql } = require('@vercel/postgres');
const seed = require('./seed.json');

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await sql`CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    client_id TEXT UNIQUE,
    c_code TEXT,
    name TEXT NOT NULL,
    mobile TEXT,
    email TEXT,
    zone TEXT,
    subzone TEXT,
    address TEXT,
    package TEXT,
    speed TEXT,
    m_bill NUMERIC DEFAULT 0,
    ex_date INTEGER,
    payment_status TEXT DEFAULT 'pending',
    balance_due NUMERIC,
    advance_payment NUMERIC,
    payment_date TEXT,
    client_type TEXT,
    connection_type TEXT,
    b_status TEXT DEFAULT 'Active',
    comments TEXT,
    thana TEXT,
    district TEXT,
    updated_at TEXT
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ex_date ON clients(ex_date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_status ON clients(payment_status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_name ON clients(name)`;

  const { rows } = await sql`SELECT COUNT(*)::int AS c FROM clients`;
  if (rows[0].c === 0 && Array.isArray(seed) && seed.length) {
    const now = new Date().toISOString();
    for (const r of seed) {
      await sql`INSERT INTO clients
        (client_id, c_code, name, mobile, email, zone, subzone, address, package, speed,
         m_bill, ex_date, payment_status, balance_due, advance_payment, payment_date,
         client_type, connection_type, b_status, comments, thana, district, updated_at)
        VALUES (${r.client_id || null}, ${r.c_code ?? null}, ${r.name || ''}, ${r.mobile || null},
         ${r.email || null}, ${r.zone || null}, ${r.subzone || null}, ${r.address || null},
         ${r.package || null}, ${r.speed || null}, ${r.m_bill ?? 0}, ${r.ex_date ?? null},
         ${r.payment_status || 'pending'}, ${r.balance_due ?? null}, ${r.advance_payment ?? null},
         ${r.payment_date || null}, ${r.client_type || null}, ${r.connection_type || null},
         ${r.b_status || 'Active'}, ${r.comments || null}, ${r.thana || null}, ${r.district || null}, ${now})
        ON CONFLICT (client_id) DO NOTHING`;
    }
  }
  schemaReady = true;
}

function todayDay() {
  return new Date().getDate();
}
function daysInMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function daysUntil(exDate) {
  const today = todayDay();
  if (exDate >= today) return exDate - today;
  return (daysInMonth() - today) + exDate;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    await ensureSchema();
  } catch (e) {
    res.status(500).end(JSON.stringify({ ok: false, error: 'Database connection failed: ' + e.message }));
    return;
  }

  const action = (req.query && req.query.action) || '';

  try {
    if (action === 'list') {
      const q = (req.query.q || '').trim();
      const status = req.query.status || 'all';
      const zone = req.query.zone || '';
      const due = req.query.due || 'all';

      let rows;
      if (q && (status === 'paid' || status === 'pending') && zone) {
        rows = (await sql`SELECT * FROM clients WHERE (name ILIKE ${'%'+q+'%'} OR client_id ILIKE ${'%'+q+'%'} OR mobile ILIKE ${'%'+q+'%'} OR c_code ILIKE ${'%'+q+'%'}) AND payment_status = ${status} AND zone = ${zone} ORDER BY ex_date ASC, name ASC`).rows;
      } else if (q && (status === 'paid' || status === 'pending')) {
        rows = (await sql`SELECT * FROM clients WHERE (name ILIKE ${'%'+q+'%'} OR client_id ILIKE ${'%'+q+'%'} OR mobile ILIKE ${'%'+q+'%'} OR c_code ILIKE ${'%'+q+'%'}) AND payment_status = ${status} ORDER BY ex_date ASC, name ASC`).rows;
      } else if (q && zone) {
        rows = (await sql`SELECT * FROM clients WHERE (name ILIKE ${'%'+q+'%'} OR client_id ILIKE ${'%'+q+'%'} OR mobile ILIKE ${'%'+q+'%'} OR c_code ILIKE ${'%'+q+'%'}) AND zone = ${zone} ORDER BY ex_date ASC, name ASC`).rows;
      } else if (q) {
        rows = (await sql`SELECT * FROM clients WHERE (name ILIKE ${'%'+q+'%'} OR client_id ILIKE ${'%'+q+'%'} OR mobile ILIKE ${'%'+q+'%'} OR c_code ILIKE ${'%'+q+'%'}) ORDER BY ex_date ASC, name ASC`).rows;
      } else if ((status === 'paid' || status === 'pending') && zone) {
        rows = (await sql`SELECT * FROM clients WHERE payment_status = ${status} AND zone = ${zone} ORDER BY ex_date ASC, name ASC`).rows;
      } else if (status === 'paid' || status === 'pending') {
        rows = (await sql`SELECT * FROM clients WHERE payment_status = ${status} ORDER BY ex_date ASC, name ASC`).rows;
      } else if (zone) {
        rows = (await sql`SELECT * FROM clients WHERE zone = ${zone} ORDER BY ex_date ASC, name ASC`).rows;
      } else {
        rows = (await sql`SELECT * FROM clients ORDER BY ex_date ASC, name ASC`).rows;
      }

      let out = rows;
      if (due !== 'all') {
        out = rows.filter((r) => {
          if (r.ex_date === null || r.ex_date === undefined) return false;
          const d = daysUntil(Number(r.ex_date));
          if (due === 'today') return d === 0;
          if (due === 'week') return d >= 0 && d <= 7;
          if (due === 'overdue') return r.payment_status === 'pending' && Number(r.ex_date) < todayDay();
          return true;
        });
      }
      out = out.map((r) => ({ ...r, days_until: (r.ex_date === null || r.ex_date === undefined) ? null : daysUntil(Number(r.ex_date)) }));
      res.end(JSON.stringify({ ok: true, clients: out }));
      return;
    }

    if (action === 'stats') {
      const { rows } = await sql`SELECT ex_date, payment_status FROM clients`;
      let today = 0, week = 0, pending = 0, paid = 0;
      for (const r of rows) {
        if (r.payment_status === 'paid') paid++; else pending++;
        if (r.ex_date === null || r.ex_date === undefined) continue;
        const d = daysUntil(Number(r.ex_date));
        if (d === 0) today++;
        if (d >= 0 && d <= 7) week++;
      }
      res.end(JSON.stringify({ ok: true, total: rows.length, due_today: today, due_week: week, pending, paid }));
      return;
    }

    if (action === 'zones') {
      const { rows } = await sql`SELECT DISTINCT zone FROM clients WHERE zone IS NOT NULL AND zone != '' ORDER BY zone`;
      res.end(JSON.stringify({ ok: true, zones: rows.map((r) => r.zone) }));
      return;
    }

    if (action === 'update') {
      const data = await readBody(req);
      const id = data.id;
      if (!id) { res.end(JSON.stringify({ ok: false, error: 'Missing id' })); return; }

      const allowed = ['name','mobile','email','zone','subzone','address','package','speed','m_bill',
        'ex_date','payment_status','balance_due','advance_payment','payment_date',
        'client_type','connection_type','b_status','comments','thana','district','client_id','c_code'];
      const set = [];
      const vals = [];
      let i = 1;
      for (const f of allowed) {
        if (Object.prototype.hasOwnProperty.call(data, f)) {
          set.push(`${f} = $${i++}`);
          vals.push(data[f]);
        }
      }
      if (!set.length) { res.end(JSON.stringify({ ok: false, error: 'Nothing to update' })); return; }
      set.push(`updated_at = $${i++}`);
      vals.push(new Date().toISOString());
      vals.push(id);

      const { db } = require('@vercel/postgres');
      const client = await db.connect();
      try {
        await client.query(`UPDATE clients SET ${set.join(', ')} WHERE id = $${i}`, vals);
      } finally {
        client.release();
      }
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (action === 'create') {
      const data = await readBody(req);
      if (!data.name) { res.end(JSON.stringify({ ok: false, error: 'Name is required' })); return; }
      const now = new Date().toISOString();
      const result = await sql`INSERT INTO clients
        (client_id, c_code, name, mobile, email, zone, subzone, address, package, speed,
         m_bill, ex_date, payment_status, balance_due, advance_payment, payment_date,
         client_type, connection_type, b_status, comments, thana, district, updated_at)
        VALUES (${data.client_id||null}, ${data.c_code||null}, ${data.name}, ${data.mobile||null},
         ${data.email||null}, ${data.zone||null}, ${data.subzone||null}, ${data.address||null},
         ${data.package||null}, ${data.speed||null}, ${data.m_bill??0}, ${data.ex_date??null},
         ${data.payment_status||'pending'}, ${data.balance_due??null}, ${data.advance_payment??null},
         ${data.payment_date||null}, ${data.client_type||null}, ${data.connection_type||null},
         ${data.b_status||'Active'}, ${data.comments||null}, ${data.thana||null}, ${data.district||null}, ${now})
        RETURNING id`;
      res.end(JSON.stringify({ ok: true, id: result.rows[0].id }));
      return;
    }

    if (action === 'delete') {
      const data = await readBody(req);
      if (!data.id) { res.end(JSON.stringify({ ok: false, error: 'Missing id' })); return; }
      await sql`DELETE FROM clients WHERE id = ${data.id}`;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (action === 'import') {
      const data = await readBody(req);
      const rows = Array.isArray(data.rows) ? data.rows : [];
      if (!rows.length) { res.end(JSON.stringify({ ok: false, error: 'No rows provided' })); return; }

      let inserted = 0, updated = 0, skipped = 0;
      const now = new Date().toISOString();
      for (const r of rows) {
        const clientId = (r.client_id || '').trim();
        const name = (r.name || '').trim();
        if (!clientId || !name) { skipped++; continue; }

        const mBill = (r.m_bill !== undefined && r.m_bill !== '' && !isNaN(r.m_bill)) ? Number(r.m_bill) : 0;
        const exDate = (r.ex_date !== undefined && r.ex_date !== '' && !isNaN(r.ex_date)) ? parseInt(r.ex_date, 10) : null;
        const balanceDue = (r.balance_due !== undefined && r.balance_due !== '' && !isNaN(r.balance_due)) ? Number(r.balance_due) : null;
        const advPay = (r.advance_payment !== undefined && r.advance_payment !== '' && !isNaN(r.advance_payment)) ? Number(r.advance_payment) : null;

        const existing = await sql`SELECT id FROM clients WHERE client_id = ${clientId}`;
        if (existing.rows.length) {
          await sql`UPDATE clients SET
            c_code=${r.c_code||null}, name=${name}, mobile=${r.mobile||null}, email=${r.email||null},
            zone=${r.zone||null}, subzone=${r.subzone||null}, address=${r.address||null},
            package=${r.package||null}, speed=${r.speed||null}, m_bill=${mBill}, ex_date=${exDate},
            balance_due=${balanceDue}, advance_payment=${advPay}, client_type=${r.client_type||null},
            connection_type=${r.connection_type||null}, b_status=${r.b_status||'Active'},
            comments=${r.comments||null}, thana=${r.thana||null}, district=${r.district||null},
            updated_at=${now}
            WHERE client_id=${clientId}`;
          updated++;
        } else {
          await sql`INSERT INTO clients
            (client_id, c_code, name, mobile, email, zone, subzone, address, package, speed,
             m_bill, ex_date, payment_status, balance_due, advance_payment, payment_date,
             client_type, connection_type, b_status, comments, thana, district, updated_at)
            VALUES (${clientId}, ${r.c_code||null}, ${name}, ${r.mobile||null}, ${r.email||null},
             ${r.zone||null}, ${r.subzone||null}, ${r.address||null}, ${r.package||null}, ${r.speed||null},
             ${mBill}, ${exDate}, 'pending', ${balanceDue}, ${advPay}, null,
             ${r.client_type||null}, ${r.connection_type||null}, ${r.b_status||'Active'},
             ${r.comments||null}, ${r.thana||null}, ${r.district||null}, ${now})`;
          inserted++;
        }
      }
      res.end(JSON.stringify({ ok: true, inserted, updated, skipped }));
      return;
    }

    res.end(JSON.stringify({ ok: false, error: 'Unknown action' }));
  } catch (e) {
    res.status(500).end(JSON.stringify({ ok: false, error: e.message }));
  }
};
