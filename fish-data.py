import json
import sqlite3
import sys

db_path, action, user_id = sys.argv[1:4]
amount = int(sys.argv[4]) if len(sys.argv) > 4 else 0
key = 'balance_' + user_id
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# quick.db v9 stores values in the `json` table (ID, json).
row = cur.execute('SELECT json FROM json WHERE ID = ?', (key,)).fetchone()
balance = json.loads(row[0]) if row else 0
if action == 'get':
    pass
elif action == 'set':
    balance = max(0, amount)
elif action == 'add':
    balance += max(0, amount)
elif action == 'remove':
    balance = max(0, balance - max(0, amount))
else:
    raise SystemExit('Unknown action')

if action != 'get':
    encoded = json.dumps(balance)
    if row:
        cur.execute('UPDATE json SET json = ? WHERE ID = ?', (encoded, key))
    else:
        cur.execute('INSERT INTO json (ID, json) VALUES (?, ?)', (key, encoded))
    conn.commit()
print(json.dumps({ 'userId': user_id, 'balance': balance }))
