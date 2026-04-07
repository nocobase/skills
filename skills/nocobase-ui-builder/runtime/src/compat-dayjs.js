const PAD_2 = (value) => String(value).padStart(2, '0');

function normalizeDate(input) {
  if (input instanceof Date) return new Date(input.getTime());
  if (typeof input === 'number' || typeof input === 'string') return new Date(input);
  if (!input) return new Date();
  if (input && typeof input.toDate === 'function') return new Date(input.toDate().getTime());
  return new Date(input);
}

function shiftDate(date, amount, unit) {
  const next = new Date(date.getTime());
  const normalizedUnit = String(unit || 'millisecond').toLowerCase();
  switch (normalizedUnit) {
    case 'year':
    case 'years':
      next.setFullYear(next.getFullYear() + amount);
      break;
    case 'month':
    case 'months':
      next.setMonth(next.getMonth() + amount);
      break;
    case 'day':
    case 'days':
      next.setDate(next.getDate() + amount);
      break;
    case 'hour':
    case 'hours':
      next.setHours(next.getHours() + amount);
      break;
    case 'minute':
    case 'minutes':
      next.setMinutes(next.getMinutes() + amount);
      break;
    case 'second':
    case 'seconds':
      next.setSeconds(next.getSeconds() + amount);
      break;
    default:
      next.setMilliseconds(next.getMilliseconds() + amount);
      break;
  }
  return next;
}

function formatDate(date, pattern = 'YYYY-MM-DDTHH:mm:ss') {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Invalid Date';
  const replacements = {
    YYYY: String(date.getFullYear()),
    MM: PAD_2(date.getMonth() + 1),
    DD: PAD_2(date.getDate()),
    HH: PAD_2(date.getHours()),
    mm: PAD_2(date.getMinutes()),
    ss: PAD_2(date.getSeconds()),
  };
  return Object.entries(replacements).reduce(
    (output, [token, value]) => output.replaceAll(token, value),
    pattern || 'YYYY-MM-DDTHH:mm:ss',
  );
}

function buildCompatInstance(input) {
  const current = normalizeDate(input);

  return {
    format(pattern) {
      return formatDate(current, pattern);
    },
    add(amount, unit) {
      return buildCompatInstance(shiftDate(current, Number(amount || 0), unit));
    },
    subtract(amount, unit) {
      return buildCompatInstance(shiftDate(current, Number(amount || 0) * -1, unit));
    },
    toDate() {
      return new Date(current.getTime());
    },
    toISOString() {
      return current.toISOString();
    },
    valueOf() {
      return current.getTime();
    },
    isValid() {
      return !Number.isNaN(current.getTime());
    },
  };
}

export function createCompatDayjs() {
  return function compatDayjs(input) {
    return buildCompatInstance(input);
  };
}
