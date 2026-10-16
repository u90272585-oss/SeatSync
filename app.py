"""Run with python app.py. Waitress serves the existing frontend and Flask API."""
import os
from waitress import serve
from server.app import create_app

app = create_app()

if __name__ == '__main__':
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '3000'))
    print(f'SeatSync Python + Flask: http://{host}:{port}', flush=True)
    serve(app, host=host, port=port, threads=4)
