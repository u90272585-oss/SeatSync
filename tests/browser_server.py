"""Temporary Flask server used only by the isolated Playwright tests."""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from werkzeug.serving import make_server
from server.app import create_app
from server.database import connect
from server.auth import hash_password

path = os.environ['SEATSYNC_TEST_DATABASE']
app = create_app(path)
db = connect(path)
db.execute('INSERT INTO users VALUES (?,?,?,?,?)',
           ('test-admin', 'Administrator', 'admin@example.test', hash_password('test-password-123'), 'admin'))
db.close()
server = make_server('127.0.0.1', 0, app, threaded=True)
print(f'http://127.0.0.1:{server.server_port}', flush=True)
server.serve_forever()
