"""Run: python -m server.create_admin. Password input is hidden."""
import os
from getpass import getpass
from uuid import uuid4
from .app import credentials, valid_name
from .auth import hash_password
from .database import ROOT, connect, initialize


def main():
    email = input('Administrator email: ')
    name = valid_name(input('Administrator name: '))
    email, password = credentials({'email': email, 'password': getpass('Password (10–128 characters): ')})
    filename = os.environ.get('DATABASE_PATH', str(ROOT / 'data/seatsync.sqlite'))
    initialize(filename)
    db = connect(filename)
    try:
        db.execute('INSERT INTO users VALUES (?,?,?,?,?)',
                   (str(uuid4()), name, email, hash_password(password), 'admin'))
        print('Administrator created. Sign in through the website.')
    finally:
        db.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(getattr(error, 'message', str(error)))
        raise SystemExit(1)
