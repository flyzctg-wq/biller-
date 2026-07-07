<?php
// Omega Network - Client Billing Tracker
// Shared DB bootstrap. SQLite file lives in data/ (writable, outside web root ideally).

$dbDir = __DIR__ . '/data';
if (!is_dir($dbDir)) {
    mkdir($dbDir, 0775, true);
}
$dbPath = $dbDir . '/clients.sqlite';
$isNew = !file_exists($dbPath);

try {
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (Exception $e) {
    http_response_code(500);
    die(json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]));
}

$pdo->exec("CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    m_bill REAL DEFAULT 0,
    ex_date INTEGER,
    payment_status TEXT DEFAULT 'pending',
    balance_due REAL,
    advance_payment REAL,
    payment_date TEXT,
    client_type TEXT,
    connection_type TEXT,
    b_status TEXT DEFAULT 'Active',
    comments TEXT,
    thana TEXT,
    district TEXT,
    updated_at TEXT
)");

$pdo->exec("CREATE INDEX IF NOT EXISTS idx_ex_date ON clients(ex_date)");
$pdo->exec("CREATE INDEX IF NOT EXISTS idx_status ON clients(payment_status)");
$pdo->exec("CREATE INDEX IF NOT EXISTS idx_name ON clients(name)");

// One-time seed from seed.json if the table is empty and the file is present.
$count = (int)$pdo->query("SELECT COUNT(*) FROM clients")->fetchColumn();
if ($count === 0 && file_exists(__DIR__ . '/seed.json')) {
    $rows = json_decode(file_get_contents(__DIR__ . '/seed.json'), true);
    if (is_array($rows)) {
        $stmt = $pdo->prepare("INSERT OR IGNORE INTO clients
            (client_id, c_code, name, mobile, email, zone, subzone, address, package, speed,
             m_bill, ex_date, payment_status, balance_due, advance_payment, payment_date,
             client_type, connection_type, b_status, comments, thana, district, updated_at)
            VALUES (:client_id,:c_code,:name,:mobile,:email,:zone,:subzone,:address,:package,:speed,
             :m_bill,:ex_date,:payment_status,:balance_due,:advance_payment,:payment_date,
             :client_type,:connection_type,:b_status,:comments,:thana,:district,:updated_at)");
        $now = date('c');
        foreach ($rows as $r) {
            $stmt->execute([
                ':client_id' => $r['client_id'] ?? null,
                ':c_code' => $r['c_code'] ?? null,
                ':name' => $r['name'] ?? '',
                ':mobile' => $r['mobile'] ?? null,
                ':email' => $r['email'] ?? null,
                ':zone' => $r['zone'] ?? null,
                ':subzone' => $r['subzone'] ?? null,
                ':address' => $r['address'] ?? null,
                ':package' => $r['package'] ?? null,
                ':speed' => $r['speed'] ?? null,
                ':m_bill' => $r['m_bill'] ?? 0,
                ':ex_date' => $r['ex_date'] ?? null,
                ':payment_status' => $r['payment_status'] ?? 'pending',
                ':balance_due' => $r['balance_due'] ?? null,
                ':advance_payment' => $r['advance_payment'] ?? null,
                ':payment_date' => $r['payment_date'] ?? null,
                ':client_type' => $r['client_type'] ?? null,
                ':connection_type' => $r['connection_type'] ?? null,
                ':b_status' => $r['b_status'] ?? 'Active',
                ':comments' => $r['comments'] ?? null,
                ':thana' => $r['thana'] ?? null,
                ':district' => $r['district'] ?? null,
                ':updated_at' => $now,
            ]);
        }
    }
}
