"""Server validation: never trust fields sent by the browser."""
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from .database import CATALOG

ALMATY = ZoneInfo('Asia/Almaty')
TABLES = CATALOG['tables']
TIMES = [f'{minute // 60:02}:{minute % 60:02}' for minute in range(540, 1111, 30)]


def is_date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        return False
    try:
        datetime.strptime(value, '%Y-%m-%d')
        return True
    except ValueError:
        return False


def is_future(date, time, now):
    return f'{date}T{time}' > now.astimezone(ALMATY).strftime('%Y-%m-%dT%H:%M')


def validate(body, now, tables=None):
    booking = {key: body.get(key) for key in ('venue', 'date', 'time')}
    booking.update(guests=str(body.get('guests', '')), table=str(body.get('table', '')))
    if not isinstance(booking['venue'], str) or booking['venue'] not in CATALOG['venues']:
        raise ValueError('Please choose a café or restaurant.')
    date, time = booking['date'], booking['time']
    if not is_date(date) or date < now.astimezone(ALMATY).strftime('%Y-%m-%d'):
        raise ValueError('Please choose today or a future date.')
    if time not in TIMES or not is_future(date, time, now):
        raise ValueError('Choose a future time between 09:00 and 18:30 (Almaty time).')
    if not re.fullmatch(r'[1-6]', booking['guests']):
        raise ValueError('Please choose between 1 and 6 guests.')
    table = next((t for t in (TABLES if tables is None else tables) if t['id'] == booking['table']), None)
    if not table or table.get('occupied') or table['seats'] < int(booking['guests']):
        raise ValueError('Please select an available table with enough seats for your group.')
    return booking
