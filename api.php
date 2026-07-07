<?php
// Omega Network - Client Billing Tracker API
header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/db.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

function input() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function todayDay() {
    return (int)date('j');
}

function daysUntil($exDate) {
    // Days from today until the next occurrence of this day-of-month (0 = today).
    $today = todayDay();
    $daysInMonth = (int)date('t');
    if ($exDate >= $today) {
        return $exDate - $today;
    }
    return ($daysInMonth - $today) + $exDate;
}

switch ($action) {

    case 'list': {
        $q = trim($_GET['q'] ?? '');
        $status = $_GET['status'] ?? 'all';
        $zone = $_GET['zone'] ?? '';
        $due = $_GET['due'] ?? 'all';

        $sql = "SELECT * FROM clients WHERE 1=1";
        $params = [];

        if ($q !== '') {
            $sql .= " AND (name LIKE :q OR client_id LIKE :q OR mobile LIKE :q OR c_code LIKE :q)";
            $params[':q'] = "%$q%";
        }
        if ($status === 'paid' || $status === 'pending') {
            $sql .= " AND payment_status = :status";
            $params[':status'] = $status;
        }
        if ($zone !== '') {
            $sql .= " AND zone = :zone";
            $params[':zone'] = $zone;
        }

        $stmt = $pdo->prepare($sql . " ORDER BY ex_date ASC, name ASC");
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if ($due !== 'all') {
            $rows = array_values(array_filter($rows, function ($r) use ($due) {
                if ($r['ex_date'] === null) return false;
                $d = daysUntil((int)$r['ex_date']);
                if ($due === 'today') return $d === 0;
                if ($due === 'week') return $d >= 0 && $d <= 7;
                if ($due === 'overdue') return $r['payment_status'] === 'pending' && (int)$r['ex_date'] < todayDay();
                return true;
            }));
        }

        foreach ($rows as &$r) {
            $r['days_until'] = $r['ex_date'] !== null ? daysUntil((int)$r['ex_date']) : null;
        }
        echo json_encode(['ok' => true, 'clients' => $rows]);
        break;
    }

    case 'stats': {
        $rows = $pdo->query("SELECT ex_date, payment_status FROM clients")->fetchAll(PDO::FETCH_ASSOC);
        $today = 0; $week = 0; $pending = 0; $paid = 0;
        foreach ($rows as $r) {
            if ($r['payment_status'] === 'paid') $paid++; else $pending++;
            if ($r['ex_date'] === null) continue;
            $d = daysUntil((int)$r['ex_date']);
            if ($d === 0) $today++;
            if ($d >= 0 && $d <= 7) $week++;
        }
        echo json_encode(['ok' => true, 'total' => count($rows), 'due_today' => $today, 'due_week' => $week, 'pending' => $pending, 'paid' => $paid]);
        break;
    }

    case 'zones': {
        $rows = $pdo->query("SELECT DISTINCT zone FROM clients WHERE zone IS NOT NULL AND zone != '' ORDER BY zone")->fetchAll(PDO::FETCH_COLUMN);
        echo json_encode(['ok' => true, 'zones' => $rows]);
        break;
    }

    case 'update': {
        $data = input();
        $id = $data['id'] ?? null;
        if (!$id) { echo json_encode(['ok' => false, 'error' => 'Missing id']); break; }

        $fields = ['name','mobile','email','zone','subzone','address','package','speed','m_bill',
                   'ex_date','payment_status','balance_due','advance_payment','payment_date',
                   'client_type','connection_type','b_status','comments','thana','district','client_id','c_code'];
        $set = [];
        $params = [':id' => $id];
        foreach ($fields as $f) {
            if (array_key_exists($f, $data)) {
                $set[] = "$f = :$f";
                $params[":$f"] = $data[$f];
            }
        }
        if (empty($set)) { echo json_encode(['ok' => false, 'error' => 'Nothing to update']); break; }
        $set[] = "updated_at = :updated_at";
        $params[':updated_at'] = date('c');

        $sql = "UPDATE clients SET " . implode(', ', $set) . " WHERE id = :id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        echo json_encode(['ok' => true]);
        break;
    }

    case 'create': {
        $data = input();
        if (empty($data['name'])) { echo json_encode(['ok' => false, 'error' => 'Name is required']); break; }
        $stmt = $pdo->prepare("INSERT INTO clients
            (client_id, c_code, name, mobile, email, zone, subzone, address, package, speed,
             m_bill, ex_date, payment_status, balance_due, advance_payment, payment_date,
             client_type, connection_type, b_status, comments, thana, district, updated_at)
            VALUES (:client_id,:c_code,:name,:mobile,:email,:zone,:subzone,:address,:package,:speed,
             :m_bill,:ex_date,:payment_status,:balance_due,:advance_payment,:payment_date,
             :client_type,:connection_type,:b_status,:comments,:thana,:district,:updated_at)");
        $stmt->execute([
            ':client_id' => $data['client_id'] ?? null,
            ':c_code' => $data['c_code'] ?? null,
            ':name' => $data['name'],
            ':mobile' => $data['mobile'] ?? null,
            ':email' => $data['email'] ?? null,
            ':zone' => $data['zone'] ?? null,
            ':subzone' => $data['subzone'] ?? null,
            ':address' => $data['address'] ?? null,
            ':package' => $data['package'] ?? null,
            ':speed' => $data['speed'] ?? null,
            ':m_bill' => $data['m_bill'] ?? 0,
            ':ex_date' => $data['ex_date'] ?? null,
            ':payment_status' => $data['payment_status'] ?? 'pending',
            ':balance_due' => $data['balance_due'] ?? null,
            ':advance_payment' => $data['advance_payment'] ?? null,
            ':payment_date' => $data['payment_date'] ?? null,
            ':client_type' => $data['client_type'] ?? null,
            ':connection_type' => $data['connection_type'] ?? null,
            ':b_status' => $data['b_status'] ?? 'Active',
            ':comments' => $data['comments'] ?? null,
            ':thana' => $data['thana'] ?? null,
            ':district' => $data['district'] ?? null,
            ':updated_at' => date('c'),
        ]);
        echo json_encode(['ok' => true, 'id' => $pdo->lastInsertId()]);
        break;
    }

    case 'delete': {
        $data = input();
        $id = $data['id'] ?? null;
        if (!$id) { echo json_encode(['ok' => false, 'error' => 'Missing id']); break; }
        $stmt = $pdo->prepare("DELETE FROM clients WHERE id = :id");
        $stmt->execute([':id' => $id]);
        echo json_encode(['ok' => true]);
        break;
    }

    case 'import': {
        // Bulk upsert. Body: { rows: [ {client_id, name, mobile, ex_date, m_bill, payment_status, ...}, ... ] }
        $data = input();
        $rows = $data['rows'] ?? [];
        if (!is_array($rows) || empty($rows)) { echo json_encode(['ok' => false, 'error' => 'No rows provided']); break; }

        $find = $pdo->prepare("SELECT id FROM clients WHERE client_id = :client_id");
        $insert = $pdo->prepare("INSERT INTO clients
            (client_id, c_code, name, mobile, email, zone, subzone, address, package, speed,
             m_bill, ex_date, payment_status, balance_due, advance_payment, payment_date,
             client_type, connection_type, b_status, comments, thana, district, updated_at)
            VALUES (:client_id,:c_code,:name,:mobile,:email,:zone,:subzone,:address,:package,:speed,
             :m_bill,:ex_date,:payment_status,:balance_due,:advance_payment,:payment_date,
             :client_type,:connection_type,:b_status,:comments,:thana,:district,:updated_at)");
        $update = $pdo->prepare("UPDATE clients SET
            c_code=:c_code, name=:name, mobile=:mobile, email=:email, zone=:zone, subzone=:subzone,
            address=:address, package=:package, speed=:speed, m_bill=:m_bill, ex_date=:ex_date,
            balance_due=:balance_due, advance_payment=:advance_payment, client_type=:client_type,
            connection_type=:connection_type, b_status=:b_status, comments=:comments, thana=:thana,
            district=:district, updated_at=:updated_at
            WHERE client_id=:client_id");

        $inserted = 0; $updated = 0; $skipped = 0;
        $now = date('c');
        foreach ($rows as $r) {
            $clientId = trim($r['client_id'] ?? '');
            $name = trim($r['name'] ?? '');
            if ($clientId === '' || $name === '') { $skipped++; continue; }

            $params = [
                ':client_id' => $clientId,
                ':c_code' => $r['c_code'] ?? null,
                ':name' => $name,
                ':mobile' => $r['mobile'] ?? null,
                ':email' => $r['email'] ?? null,
                ':zone' => $r['zone'] ?? null,
                ':subzone' => $r['subzone'] ?? null,
                ':address' => $r['address'] ?? null,
                ':package' => $r['package'] ?? null,
                ':speed' => $r['speed'] ?? null,
                ':m_bill' => is_numeric($r['m_bill'] ?? null) ? $r['m_bill'] : 0,
                ':ex_date' => is_numeric($r['ex_date'] ?? null) ? (int)$r['ex_date'] : null,
                ':balance_due' => is_numeric($r['balance_due'] ?? null) ? $r['balance_due'] : null,
                ':advance_payment' => is_numeric($r['advance_payment'] ?? null) ? $r['advance_payment'] : null,
                ':client_type' => $r['client_type'] ?? null,
                ':connection_type' => $r['connection_type'] ?? null,
                ':b_status' => $r['b_status'] ?? 'Active',
                ':comments' => $r['comments'] ?? null,
                ':thana' => $r['thana'] ?? null,
                ':district' => $r['district'] ?? null,
                ':updated_at' => $now,
            ];

            $find->execute([':client_id' => $clientId]);
            $existing = $find->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                $update->execute($params);
                $updated++;
            } else {
                $params[':payment_status'] = 'pending';
                $params[':payment_date'] = null;
                $insert->execute($params);
                $inserted++;
            }
        }
        echo json_encode(['ok' => true, 'inserted' => $inserted, 'updated' => $updated, 'skipped' => $skipped]);
        break;
    }

    default:
        echo json_encode(['ok' => false, 'error' => 'Unknown action']);
}
