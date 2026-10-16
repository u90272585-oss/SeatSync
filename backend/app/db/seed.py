from app.core.config import settings
from app.core.security import hash_password
from app.models.table import DiningTable
from app.models.user import User
from app.models.venue import Venue


def seed_demo_data(db):
    venue_seed = [
        {
            "id": "cafe",
            "name": "SeatSync Café",
            "description": "Sunny neighborhood venue for coffee, brunch, and casual gatherings.",
            "location": "Almaty · Indoor dining",
            "opening_hours": "09:00-20:00",
            "active": True,
        },
        {
            "id": "restaurant",
            "name": "The Violet Room",
            "description": "Elegant dining room for intimate gatherings and special nights.",
            "location": "Almaty · Fine dining",
            "opening_hours": "12:00-22:00",
            "active": True,
        },
        {
            "id": "bistro",
            "name": "Garden Bistro",
            "description": "Warm, lively bistro with room for lively group dinners.",
            "location": "Almaty · Terrace dining",
            "opening_hours": "10:00-21:00",
            "active": True,
        },
    ]

    for item in venue_seed:
        venue = db.query(Venue).filter(Venue.id == item["id"]).first()
        if not venue:
            db.add(Venue(**item))
        else:
            for field, value in item.items():
                setattr(venue, field, value)

    table_seed = [
        {"venue_id": "cafe", "table_number": 1, "display_name": "Window nook", "seat_capacity": 2, "active": True, "blocked": False},
        {"venue_id": "cafe", "table_number": 2, "display_name": "Coffee corner", "seat_capacity": 2, "active": True, "blocked": False},
        {"venue_id": "cafe", "table_number": 3, "display_name": "Garden view", "seat_capacity": 4, "active": True, "blocked": False},
        {"venue_id": "cafe", "table_number": 4, "display_name": "Cozy booth", "seat_capacity": 4, "active": True, "blocked": False},
        {"venue_id": "cafe", "table_number": 5, "display_name": "The gathering", "seat_capacity": 6, "active": True, "blocked": False},
        {"venue_id": "cafe", "table_number": 6, "display_name": "Sunshine spot", "seat_capacity": 6, "active": True, "blocked": False},
        {"venue_id": "restaurant", "table_number": 1, "display_name": "Candle booth", "seat_capacity": 2, "active": True, "blocked": False},
        {"venue_id": "restaurant", "table_number": 2, "display_name": "Couple table", "seat_capacity": 2, "active": True, "blocked": False},
        {"venue_id": "restaurant", "table_number": 3, "display_name": "Long table", "seat_capacity": 6, "active": True, "blocked": False},
        {"venue_id": "bistro", "table_number": 1, "display_name": "Patio corner", "seat_capacity": 4, "active": True, "blocked": False},
        {"venue_id": "bistro", "table_number": 2, "display_name": "Market share", "seat_capacity": 4, "active": True, "blocked": False},
        {"venue_id": "bistro", "table_number": 3, "display_name": "Community table", "seat_capacity": 8, "active": True, "blocked": False},
    ]

    for item in table_seed:
        existing = db.query(DiningTable).filter(DiningTable.venue_id == item["venue_id"], DiningTable.table_number == item["table_number"]).first()
        if not existing:
            db.add(DiningTable(**item))
        else:
            for field, value in item.items():
                setattr(existing, field, value)

    admin_email = settings.FIRST_ADMIN_EMAIL.lower()
    admin_user = db.query(User).filter(User.email == admin_email).first()
    if settings.FIRST_ADMIN_PASSWORD:
        if not admin_user:
            db.add(
                User(
                    name=settings.FIRST_ADMIN_NAME,
                    email=admin_email,
                    password_hash=hash_password(settings.FIRST_ADMIN_PASSWORD),
                    role="admin",
                )
            )
        else:
            admin_user.name = settings.FIRST_ADMIN_NAME
            admin_user.password_hash = hash_password(settings.FIRST_ADMIN_PASSWORD)
            admin_user.role = "admin"

    db.commit()
