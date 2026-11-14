"""Passwords use the same salted scrypt format as the previous Node backend."""
import hashlib
import hmac
import re
import secrets


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    key = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64)
    return f'{salt}:{key.hex()}'


def verify_password(password, stored):
    if not re.fullmatch(r'[a-f0-9]{32}:[a-f0-9]{128}', stored):
        return False
    return hmac.compare_digest(hash_password(password, stored.split(':')[0]), stored)
