import argparse

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import User


def bootstrap_admin(email: str = None, password: str = None, name: str = None):
    db = SessionLocal()
    try:
        admin_email = (email or settings.FIRST_ADMIN_EMAIL).strip().lower()
        admin_name = name or settings.FIRST_ADMIN_NAME
        admin_password = password or settings.FIRST_ADMIN_PASSWORD
        if not admin_password:
            raise ValueError("Set SEATSYNC_FIRST_ADMIN_PASSWORD or pass --password.")

        user = db.query(User).filter(User.email == admin_email).first()
        if user is None:
            user = User(name=admin_name, email=admin_email, password_hash=hash_password(admin_password), role="admin")
            db.add(user)
        else:
            user.name = admin_name
            user.password_hash = hash_password(admin_password)
            user.role = "admin"

        db.commit()
        print(f"Admin bootstrapped: {admin_email} ({admin_name})")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bootstrap the initial administrator user.")
    parser.add_argument("--email", default=settings.FIRST_ADMIN_EMAIL, help="Administrator email to create or update.")
    parser.add_argument("--password", help="Administrator password.")
    parser.add_argument("--name", default=settings.FIRST_ADMIN_NAME, help="Administrator display name.")
    args = parser.parse_args()
    bootstrap_admin(args.email, args.password, args.name)
