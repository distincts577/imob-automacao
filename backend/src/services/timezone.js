// CORRIGIDO: todo o agendamento (horário dos templates, quiet hours, dia da
// semana permitido, contagem "mensagens enviadas hoje") usava Date.getHours()
// / .getDay() / .setHours(), que refletem o fuso horário do PROCESSO Node —
// no Render isso é UTC por padrão, não America/Sao_Paulo. Resultado: um
// template configurado para "09:00" era agendado às 09:00 UTC (= 06:00 em
// Brasília), 3h adiantado do que a tela de Mensagens mostrava.
//
// GeneralSettings já tinha um campo `timezone` (default "America/Sao_Paulo")
// pensado exatamente pra isso, mas nada no código o lia. Este módulo
// centraliza a conversão, usando Intl (sem dependência externa), e todo
// lugar que lidava com hora/dia local passa a receber o fuso vindo das
// configurações em vez de assumir o fuso do servidor.

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

const ISO_WEEKDAY_MAP = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Decompõe um instante (Date) nos campos de data/hora como são vistos no fuso indicado. */
function getZonedParts(date, timeZone = DEFAULT_TIMEZONE) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    isoWeekday: ISO_WEEKDAY_MAP[parts.weekday], // 1=segunda ... 7=domingo
  };
}

/** Offset (em minutos) do fuso em relação ao UTC no instante dado (negativo para Brasil). */
function getTimeZoneOffsetMinutes(timeZone, date) {
  const p = getZonedParts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUTC - date.getTime()) / 60000;
}

/** Instante UTC real (Date) que corresponde a HH:MM de HOJE, no fuso indicado. */
function zonedTimeToday(hour, minute, timeZone = DEFAULT_TIMEZONE, referenceDate = new Date()) {
  const today = getZonedParts(referenceDate, timeZone);
  const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, referenceDate);
  const naiveUTC = Date.UTC(today.year, today.month - 1, today.day, hour, minute, 0);
  return new Date(naiveUTC - offsetMinutes * 60000);
}

/** Início do dia (00:00) de HOJE no fuso indicado, como instante UTC real. */
function startOfZonedDay(timeZone = DEFAULT_TIMEZONE, referenceDate = new Date()) {
  return zonedTimeToday(0, 0, timeZone, referenceDate);
}

module.exports = {
  DEFAULT_TIMEZONE,
  getZonedParts,
  getTimeZoneOffsetMinutes,
  zonedTimeToday,
  startOfZonedDay,
};
